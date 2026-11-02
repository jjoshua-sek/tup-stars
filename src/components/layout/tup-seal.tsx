import Image from "next/image";

import { cn } from "@/lib/utils";

/**
 * The official TUP seal (public/tup-seal.png). It sits on a white disc so
 * the red gear stays visible on the maroon header, sign-in panel and ID
 * card. The caller sizes it with classes (in rem, so it grows with the text
 * size switch). Served as-is (unoptimized): the file is small, and the
 * offline LAN copy then needs no image resizer.
 */
export function TupSeal({ className }: { className: string }) {
  return (
    <span className={cn("inline-flex shrink-0 rounded-full bg-white p-0.5", className)}>
      <Image
        src="/tup-seal.png"
        alt="Technological University of the Philippines seal"
        width={138}
        height={138}
        unoptimized
        className="h-full w-full"
      />
    </span>
  );
}
