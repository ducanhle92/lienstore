"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import type { Slide } from "@/types/lienstore";
import { cn } from "@/lib/utils";

/**
 * MetaSlider (FlexSlider) hero carousel from the linconnn.io.vn home page.
 * Fades between slides every `intervalMs`, with control-nav dots below the
 * image and hover-revealed direction arrows drawn from the FlexSlider sprite.
 * Measured: slideshowSpeed 5000, animation "fade" 300ms, no pause on hover.
 */
export interface HeroSliderProps {
  slides: Slide[];
  /** Path to the 57×27 bg_direction_nav sprite (prev = left half, next = right half). */
  arrowSprite: string;
  /** Autoplay delay in milliseconds. Defaults to 5000 (FlexSlider slideshowSpeed). */
  intervalMs?: number;
  className?: string;
  /** Edge-to-edge banner: no rounding, the artwork stays centred at its native width and a blurred copy fills the sides. */
  fullBleed?: boolean;
}

const SLIDE_WIDTH = 1280;
const SLIDE_HEIGHT = 520;

export function HeroSlider({ slides, arrowSprite, intervalMs = 5000, className, fullBleed = false }: HeroSliderProps) {
  const [index, setIndex] = useState(0);
  const count = slides.length;

  const goTo = useCallback(
    (next: number) => {
      if (count === 0) return;
      setIndex(((next % count) + count) % count);
    },
    [count],
  );

  // Autoplay. Depending on `index` restarts the timer after every change
  // (auto, dot, or arrow), matching FlexSlider's behaviour. Does not pause on hover.
  useEffect(() => {
    if (count <= 1) return;
    const id = window.setInterval(() => {
      setIndex((current) => (current + 1) % count);
    }, intervalMs);
    return () => window.clearInterval(id);
  }, [count, index, intervalMs]);

  if (count === 0) return null;

  const arrowBase = cn(
    "absolute top-1/2 z-10 mt-[-20px] block h-[30px] w-[30px] cursor-pointer overflow-hidden",
    "border-0 bg-transparent bg-no-repeat p-0 opacity-0",
    "[transition:all_0.3s_ease] group-hover:opacity-80 hover:opacity-100",
  );

  return (
    <div className={cn("group relative mb-[40px] w-full", fullBleed ? "" : "rounded-[4px]", className)}>
      <div
        role="region"
        aria-roledescription="carousel"
        aria-label="Featured products"
        className={cn("relative aspect-[1280/520] w-full overflow-hidden", fullBleed ? "max-h-[520px] bg-lien-blue-soft" : "rounded-[4px]")}
      >
        <ul className="m-0 list-none p-0">
          {slides.map((slide, i) => {
            const active = i === index;
            return (
              <li
                key={slide.image}
                aria-hidden={active ? undefined : true}
                className={cn(
                  "absolute inset-0 transition-opacity duration-300 ease-in-out",
                  active ? "z-[2] opacity-100" : "pointer-events-none z-[1] opacity-0",
                )}
              >
                <a href={slide.href} tabIndex={active ? undefined : -1} className="relative block h-full w-full">
                  {fullBleed ? <Image src={slide.image} alt="" fill sizes="100vw" aria-hidden className="scale-110 object-cover opacity-80 blur-2xl" /> : null}
                  <Image
                    src={slide.image}
                    alt={slide.alt}
                    width={SLIDE_WIDTH}
                    height={SLIDE_HEIGHT}
                    priority={i === 0}
                    className={cn("relative block", fullBleed ? "mx-auto h-full w-auto max-w-full object-contain" : "h-auto w-full")}
                  />
                </a>
              </li>
            );
          })}
        </ul>
      </div>

      {/* Control nav: 11px dots centred 16px below the image, inside the 40px bottom margin. */}
      <ol className="absolute left-0 right-0 top-[calc(100%+16px)] z-[2] m-0 h-[11px] list-none p-0 text-center leading-[11px]">
        {slides.map((slide, i) => {
          const active = i === index;
          return (
            <li key={slide.image} className="inline-block h-[11px] w-[23px] align-top">
              <button
                type="button"
                aria-label={`Slide ${i + 1}`}
                aria-current={active ? "true" : undefined}
                onClick={() => goTo(i)}
                className={cn(
                  "mx-[6px] block h-[11px] w-[11px] cursor-pointer rounded-[20px] border-0 p-0",
                  active ? "bg-black/90" : "bg-black/50 hover:bg-black/70",
                )}
              >
                <span className="sr-only">{i + 1}</span>
              </button>
            </li>
          );
        })}
      </ol>

      {/* Direction nav: slides in from -50px to 5px when the slider is hovered. */}
      <button
        type="button"
        aria-label="Previous"
        onClick={() => goTo(index - 1)}
        className={cn(arrowBase, "left-[-50px] bg-[position:0_0] group-hover:left-[5px]")}
        style={{ backgroundImage: `url(${arrowSprite})` }}
      >
        <span className="sr-only">Previous</span>
      </button>
      <button
        type="button"
        aria-label="Next"
        onClick={() => goTo(index + 1)}
        className={cn(arrowBase, "right-[-50px] bg-[position:100%_0] group-hover:right-[5px]")}
        style={{ backgroundImage: `url(${arrowSprite})` }}
      >
        <span className="sr-only">Next</span>
      </button>
    </div>
  );
}
