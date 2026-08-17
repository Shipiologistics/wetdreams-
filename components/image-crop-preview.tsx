"use client";

import { useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";

export type CropState = { zoom: number; x: number; y: number; rotation: number };

type ImageCropPreviewProps = {
  src: string;
  crop: CropState;
  onChange: (updater: (crop: CropState) => CropState) => void;
  adjusting: boolean;
  alt: string;
};

export function ImageCropPreview({ src, crop, onChange, adjusting, alt }: ImageCropPreviewProps) {
  const [dimensions, setDimensions] = useState<{ width: number; height: number } | null>(null);
  const dragRef = useRef<{ pointerId: number; startX: number; startY: number; cropX: number; cropY: number; size: number } | null>(null);

  function startDrag(event: ReactPointerEvent<HTMLDivElement>) {
    if (!adjusting) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const dragZoom = Math.max(crop.zoom, 1.18);
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      cropX: crop.x,
      cropY: crop.y,
      size: Math.max(1, rect.width),
    };
    if (crop.zoom < dragZoom) {
      onChange((current) => ({ ...current, zoom: Math.max(current.zoom, dragZoom) }));
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
  }

  function moveDrag(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const sensitivity = 100 / drag.size;
    onChange((current) => ({
      ...current,
      x: clamp(drag.cropX + (event.clientX - drag.startX) * sensitivity, -50, 50),
      y: clamp(drag.cropY + (event.clientY - drag.startY) * sensitivity, -50, 50),
    }));
    event.preventDefault();
  }

  function endDrag(event: ReactPointerEvent<HTMLDivElement>) {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    event.currentTarget.releasePointerCapture(event.pointerId);
    dragRef.current = null;
  }

  const imageStyle = dimensions ? cropImageStyle(crop, dimensions) : {
    width: `${crop.zoom * 100}%`,
    height: `${crop.zoom * 100}%`,
    left: "50%",
    top: "50%",
    transform: `translate(-50%, -50%) rotate(${crop.rotation}deg)`,
  };

  return (
    <div
      className={`square-media-preview ${adjusting ? "is-draggable is-adjusting" : ""}`}
      onPointerDown={startDrag}
      onPointerMove={moveDrag}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        className="crop-image-preview"
        src={src}
        alt={alt}
        draggable={false}
        onLoad={(event) => setDimensions({
          width: event.currentTarget.naturalWidth || 1,
          height: event.currentTarget.naturalHeight || 1,
        })}
        style={imageStyle}
      />
      {adjusting && <span className="crop-frame" aria-hidden="true" />}
    </div>
  );
}

function cropImageStyle(crop: CropState, dimensions: { width: number; height: number }) {
  const ratio = dimensions.width / Math.max(1, dimensions.height);
  const baseWidth = ratio >= 1 ? ratio * 100 : 100;
  const baseHeight = ratio >= 1 ? 100 : (100 / ratio);
  const width = baseWidth * crop.zoom;
  const height = baseHeight * crop.zoom;
  const maxOffsetX = Math.max(0, (width - 100) / 2);
  const maxOffsetY = Math.max(0, (height - 100) / 2);
  const offsetX = (crop.x / 50) * maxOffsetX;
  const offsetY = (crop.y / 50) * maxOffsetY;

  return {
    width: `${width}%`,
    height: `${height}%`,
    left: `calc(50% + ${offsetX}%)`,
    top: `calc(50% + ${offsetY}%)`,
    transform: `translate(-50%, -50%) rotate(${crop.rotation}deg)`,
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
