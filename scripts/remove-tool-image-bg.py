# /// script
# requires-python = ">=3.11"
# dependencies = ["rembg[cpu]==2.0.85", "scipy", "psycopg[binary]"]
# ///
"""Remove o fundo branco das fotos de produto em `tool-images`.

Sem `--apply` só gera os PNGs em `--out` para revisão. Com `--apply` sobe o PNG
já revisado em `--out` (ou gera na hora se faltar) como um `.webp` novo, troca
`tool_image.url` e acrescenta `id,url_antiga,url_nova` em `rollback.csv`.
O arquivo original fica no bucket.
Foto que já tem transparência ou cuja borda não é branca é ignorada, então o
script pode rodar de novo sem refazer nada.

    uv run --env-file apps/web/.env scripts/remove-tool-image-bg.py --out /tmp/bg
    uv run --env-file apps/web/.env scripts/remove-tool-image-bg.py --out /tmp/bg --apply

O BiRefNet pede uns 18 GB. Fora de um scope com teto, o script se reexecuta via
scripts/run-capped.sh com MEM_HIGH=16G e MEM_MAX=20G (o env sobrescreve).
`--print-cgroup` mostra o cgroup e sai, sem banco nem modelo.
"""

import argparse
import csv
import io
import os
import shutil
import subprocess
import sys
import urllib.request
import uuid
from pathlib import Path

import numpy as np
import psycopg
from PIL import Image
from rembg import new_session, remove
from scipy import ndimage

BUCKET = "tool-images"
MODEL = "birefnet-general"
BORDER_WHITE_MIN = 0.8
WHITE_MIN = 238
SOLID_MAX = 190
CHROMA_MIN = 28
EDGE_PX = 3
MIN_HOLE_PX = 400
WEBP = {"quality": 90, "alpha_quality": 100, "method": 6}


def border_white_ratio(rgb: np.ndarray) -> float:
    b = 4
    border = np.concatenate(
        [rgb[:b].reshape(-1, 3), rgb[-b:].reshape(-1, 3), rgb[:, :b].reshape(-1, 3), rgb[:, -b:].reshape(-1, 3)]
    )
    return float((border.min(1) >= 240).mean())


def refine(rgb: np.ndarray, model_alpha: np.ndarray) -> np.ndarray:
    """Corrige o alpha do modelo sabendo que o fundo é branco.

    Pele, plástico e peça colorida ficam opacos, então o modelo não abre buraco
    no produto. Cada área branca fechada pelo produto sai ou fica inteira pela
    média do modelo: o vão da pá do misturador sai, o rótulo branco da maleta fica.
    """
    lo = rgb.min(2)
    alpha = model_alpha.astype(np.float32) / 255
    near_white = lo >= WHITE_MIN

    labels, n = ndimage.label(near_white)
    border = set(np.concatenate([labels[0], labels[-1], labels[:, 0], labels[:, -1]]).tolist()) - {0}
    index = np.arange(1, n + 1)
    sizes = ndimage.sum(np.ones_like(lo), labels, index=index)
    means = ndimage.mean(alpha, labels, index=index)
    decided = np.full(n + 1, -1.0)
    for k in index:
        if k in border:
            decided[k] = 0.0
        elif sizes[k - 1] >= MIN_HOLE_PX:
            decided[k] = 0.0 if means[k - 1] < 0.5 else 1.0
    region = decided[labels]
    alpha[ndimage.binary_erosion(near_white, iterations=EDGE_PX) & (region == 0)] = 0
    alpha[region == 1] = 1

    chroma = rgb.max(2).astype(np.int16) - lo
    solid = ndimage.binary_erosion((lo < SOLID_MAX) | (chroma > CHROMA_MIN), iterations=EDGE_PX)
    return np.maximum(alpha, solid.astype(np.float32))


def cut_out(img: Image.Image, session) -> Image.Image:
    rgb = np.asarray(img.convert("RGB"))
    model_alpha = np.asarray(remove(img, session=session))[..., 3]
    alpha = refine(rgb, model_alpha)
    a = np.clip(alpha, 1 / 255, 1)[..., None]
    fg = np.clip((rgb.astype(np.float32) - (1 - a) * 255) / a, 0, 255)
    return Image.fromarray(np.dstack([fg, alpha * 255]).round().astype(np.uint8), "RGBA")


def fetch(url: str) -> Image.Image:
    with urllib.request.urlopen(url) as r:
        return Image.open(io.BytesIO(r.read()))


def upload(base: str, key: str, name: str, body: bytes) -> str:
    req = urllib.request.Request(
        f"{base}/storage/v1/object/{BUCKET}/{name}",
        data=body,
        method="POST",
        headers={"Authorization": f"Bearer {key}", "apikey": key, "Content-Type": "image/webp", "x-upsert": "false"},
    )
    urllib.request.urlopen(req).close()
    return f"{base}/storage/v1/object/public/{BUCKET}/{name}"


MIN_CAP_BYTES = 16 * 1024**3


def cgroup_memory_max() -> tuple[str, str]:
    cgroup = Path("/proc/self/cgroup").read_text().strip().split("::", 1)[1]
    return cgroup, Path(f"/sys/fs/cgroup{cgroup}/memory.max").read_text().strip()


def ensure_capped() -> None:
    if os.environ.get("RUN_CAPPED"):
        limit = cgroup_memory_max()[1]
        if limit != "max" and int(limit) < MIN_CAP_BYTES:
            sys.exit(f"teto de memória herdado ({int(limit) // 1024**3}G) é menor que os 16G que o BiRefNet pede; rode fora do run-capped ou com MEM_HIGH=16G MEM_MAX=20G")
        return
    if shutil.which("systemd-run") is None:
        return
    probe = subprocess.run(["systemd-run", "--user", "--scope", "--quiet", "true"], capture_output=True, check=False)
    if probe.returncode != 0:
        return
    os.environ.setdefault("MEM_HIGH", "16G")
    os.environ.setdefault("MEM_MAX", "20G")
    run_capped = str(Path(__file__).resolve().parent / "run-capped.sh")
    os.execv(run_capped, [run_capped, sys.executable, *sys.argv])


def main() -> None:
    ensure_capped()
    p = argparse.ArgumentParser()
    p.add_argument("--out", type=Path)
    p.add_argument("--apply", action="store_true")
    p.add_argument("--print-cgroup", action="store_true")
    args = p.parse_args()
    if args.print_cgroup:
        cgroup, limit = cgroup_memory_max()
        print(cgroup, "memory.max =", limit)
        return
    if args.out is None:
        p.error("--out é obrigatório")
    args.out.mkdir(parents=True, exist_ok=True)
    base = os.environ["NEXT_PUBLIC_SUPABASE_URL"].rstrip("/")
    key = os.environ["SUPABASE_SERVICE_ROLE_KEY"] if args.apply else ""
    session = new_session(MODEL)

    with psycopg.connect(os.environ["DATABASE_URL"], prepare_threshold=None, autocommit=True) as conn:
        rows = conn.execute(
            "select id, url from tool_image where url like %s order by tool_id, sort_order",
            (f"%/{BUCKET}/%",),
        ).fetchall()
        done = skipped = 0
        for image_id, url in rows:
            img = fetch(url)
            if "A" in img.getbands() or border_white_ratio(np.asarray(img.convert("RGB"))) < BORDER_WHITE_MIN:
                skipped += 1
                continue
            png = args.out / f"{image_id}.png"
            if png.exists():
                result = Image.open(png)
            else:
                result = cut_out(img, session)
                result.save(png)
            if args.apply:
                buf = io.BytesIO()
                result.save(buf, "WEBP", **WEBP)
                new_url = upload(base, key, f"{uuid.uuid4()}.webp", buf.getvalue())
                cur = conn.execute("update tool_image set url = %s where id = %s and url = %s", (new_url, image_id, url))
                if cur.rowcount != 1:
                    raise SystemExit(f"{image_id}: url mudou durante a execução, {new_url} ficou sem uso no bucket")
                with open(args.out / "rollback.csv", "a", newline="") as f:
                    csv.writer(f).writerow([image_id, url, new_url])
            done += 1
            print(f"{image_id} ok", flush=True)
        print(f"{done} processadas, {skipped} ignoradas, apply={args.apply}")


if __name__ == "__main__":
    main()
