/** Width classes for a product card inside ProductCarousel: 2 per view on phones, 3 / 4 / 6 as the screen grows.
 *  (Plain module on purpose: a string exported from a "use client" file turns into a client reference on the server.) */
export const CAROUSEL_ITEM = "snap-start shrink-0 w-[calc((100%-0.75rem)/2)] sm:w-[calc((100%-0.75rem*2)/3)] md:w-[calc((100%-1rem*3)/4)] lg:w-[calc((100%-1rem*5)/6)]";
