"use client";

import {
	DirectionProvider as BaseDirectionProvider,
	useDirection as useBaseDirection,
} from "@base-ui/react/direction-provider";

const DirectionProvider = BaseDirectionProvider;
const useDirection = useBaseDirection;

export { DirectionProvider, useDirection };
