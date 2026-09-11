"use client";

import { useRef, useState, type MouseEvent } from "react";
import Image from "next/image";
import { cn } from "@/lib/utils";

interface ProductGalleryProps {
  images: string[];
  alt: string;
  className?: string;
  /** Shop logo stamped bottom-right on every picture (deters copying); the stored files stay clean. */
  watermark?: string | null;
}

const ZOOM = 2.25; // 547px image → 900px source, like WP Image Zoom's "window" mode
const LENS = { w: 243, h: 219 };
const WINDOW = { w: 400, h: 360 };

/**
 * `.woocommerce-product-gallery`: 547×547 square at 1140px (48% of the row, floated left), full
 * width below 768px. A single image renders alone; several images add a 4-column thumbnail row.
 * Hovering the main image shows a lens and a zoom window to the right (WP Image Zoooom plugin).
 */
export function ProductGallery({ images, alt, className, watermark = null }: ProductGalleryProps) {
  const [index, setIndex] = useState(0);
  const [lens, setLens] = useState<{ x: number; y: number; w: number; h: number; size: number } | null>(null);
  const frame = useRef<HTMLDivElement>(null);
  const current = images[Math.min(index, Math.max(0, images.length - 1))] ?? "";

  const onMove = (e: MouseEvent<HTMLDivElement>) => {
    const el = frame.current;
    if (!el || window.innerWidth < 992) return;
    const r = el.getBoundingClientRect();
    const w = Math.min(LENS.w, r.width);
    const h = Math.min(LENS.h, r.height);
    const x = Math.max(0, Math.min(r.width - w, e.clientX - r.left - w / 2));
    const y = Math.max(0, Math.min(r.height - h, e.clientY - r.top - h / 2));
    setLens({ x, y, w, h, size: r.width });
  };

  const bgSize = (lens?.size ?? 547) * ZOOM;

  return (
    <div className={cn("woocommerce-product-gallery relative mb-8 w-full sm:float-left sm:w-[48%]", className)}>
      <figure className="m-0">
        <div
          ref={frame}
          onMouseMove={onMove}
          onMouseLeave={() => setLens(null)}
          onContextMenu={(e) => e.preventDefault()}
          className="woocommerce-product-gallery__image relative aspect-square w-full overflow-visible rounded-md border border-lien-line bg-white"
        >
          {/* no link to the file and no context menu: pictures are viewed here, not opened / saved directly */}
          <div className="absolute inset-0 block select-none p-3">
            {/* all pictures stay mounted and pre-loaded; only the selected one is visible, so a thumbnail click is instant */}
            {images.map((src, i) => (
              <Image
                key={src}
                src={src}
                alt={i === index ? alt : ""}
                width={600}
                height={600}
                priority={i === 0}
                loading={i === 0 ? undefined : "eager"}
                aria-hidden={i === index ? undefined : true}
                draggable={false}
                onContextMenu={(e) => e.preventDefault()}
                className={cn("absolute inset-3 block h-[calc(100%-1.5rem)] w-[calc(100%-1.5rem)] object-contain transition-opacity duration-150 select-none", i === index ? "opacity-100" : "pointer-events-none opacity-0")}
              />
            ))}
          </div>
          {watermark ? (
            // eslint-disable-next-line @next/next/no-img-element -- theme logo, plain img keeps the overlay light
            <img src={watermark} alt="" aria-hidden="true" draggable={false} className="pointer-events-none absolute right-5 bottom-5 z-[5] w-[22%] max-w-[120px] select-none opacity-80 drop-shadow-[0_1px_2px_rgba(0,0,0,0.25)]" />
          ) : null}
          {lens ? (
            <>
              <div className="zoomTint pointer-events-none absolute inset-0 bg-black/10" aria-hidden="true" />
              <div
                className="zoomLens pointer-events-none absolute border border-[#888888] bg-white/40"
                style={{ left: lens.x, top: lens.y, width: lens.w, height: lens.h }}
                aria-hidden="true"
              />
              <div
                className="zoomWindow pointer-events-none absolute top-0 left-[calc(100%+10px)] z-20 hidden border border-[#888888] bg-white bg-no-repeat shadow-md md:block"
                style={{
                  width: WINDOW.w,
                  height: WINDOW.h,
                  backgroundImage: `url(${current})`,
                  backgroundSize: `${bgSize}px ${bgSize}px`,
                  backgroundPosition: `-${lens.x * ZOOM}px -${lens.y * ZOOM}px`,
                }}
                aria-hidden="true"
              />
            </>
          ) : null}
        </div>
        {images.length > 1 ? (
          <ol className="m-0 mt-3 grid list-none grid-cols-5 gap-2 p-0 sm:grid-cols-6">
            {images.map((src, i) => {
              const active = i === index;
              return (
                <li key={src} className="m-0 p-0">
                  <button
                    type="button"
                    onClick={() => setIndex(i)}
                    aria-label={`Ảnh ${i + 1} của ${images.length}`}
                    aria-current={active ? "true" : undefined}
                    className={cn(
                      "block aspect-square w-full cursor-pointer overflow-hidden rounded-md border-2 bg-white p-0",
                      active ? "border-lien-blue" : "border-transparent hover:border-lien-blue/50",
                    )}
                  >
                    <span className="relative block h-full w-full">
                      <Image src={src} alt="" width={100} height={100} draggable={false} onContextMenu={(e) => e.preventDefault()} className="block h-full w-full select-none object-contain" />
                      {watermark ? (
                        // eslint-disable-next-line @next/next/no-img-element -- theme logo overlay
                        <img src={watermark} alt="" aria-hidden="true" draggable={false} className="pointer-events-none absolute right-1 bottom-1 w-[34%] select-none opacity-80" />
                      ) : null}
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        ) : null}
      </figure>
    </div>
  );
}
