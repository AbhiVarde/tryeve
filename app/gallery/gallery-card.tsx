"use client";

import Link from "next/link";
import Image from "next/image";

export function GalleryCard({ id }: { id: string }) {
  return (
    <Link
      href={`/agent/${id}`}
      className="group relative block aspect-[1200/630] overflow-hidden rounded-xl border border-border/40 transition-colors hover:border-border"
    >
      <Image
        src={`/agent/${id}/opengraph-image`}
        alt=""
        fill
        sizes="(min-width: 640px) 50vw, 100vw"
        className="object-cover transition-transform duration-300 group-hover:scale-[1.02]"
      />
    </Link>
  );
}
