import NextImage, { type ImageProps } from "next/image";

/** This site's own origins — anything else in an http(s) src is an outside host. */
const OWN = /^https?:\/\/(www\.)?linconnn\.io\.vn\//i;

/**
 * next/image for the whole site. Product photos are sometimes linked straight from a maker's / shop's site
 * (netshop.create-sd.co.jp…): the image optimizer only serves this site's own files and answers 400 for any other
 * host, which showed as a broken thumbnail (variant swatches, cards, gallery, cart). An outside http(s) src is
 * therefore handed to the browser as is (`unoptimized`); local files keep going through the optimizer.
 */
export default function Image(props: ImageProps) {
  const src = typeof props.src === "string" ? props.src : "";
  const external = /^https?:\/\//i.test(src) && !OWN.test(src);
  return <NextImage {...props} alt={props.alt} unoptimized={props.unoptimized || external} />;
}
