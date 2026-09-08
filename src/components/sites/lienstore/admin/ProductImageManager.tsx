"use client";

import { useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { uploadImage } from "./image-upload";
import { adminInput, adminLabel, btnSecondary } from "./ui";

interface Props {
  /** Initial image list (paths or URLs). The first entry is the thumbnail. */
  initial: string[];
  /** Known thumbnail paths for uploaded images (image → thumb). */
  initialThumbs?: Record<string, string>;
  error?: string;
}


/**
 * Image list editor for the product form: upload from disk (resized in the browser), add by URL, reorder, remove.
 * Submits through hidden inputs `images` (one path per line) and `thumb` (thumbnail of the first image).
 */
export function ProductImageManager({ initial, initialThumbs = {}, error }: Props) {
  const [images, setImages] = useState<string[]>(initial);
  const [thumbs, setThumbs] = useState<Record<string, string>>(initialThumbs);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= images.length) return;
    const next = [...images];
    [next[i], next[j]] = [next[j], next[i]];
    setImages(next);
  };
  const remove = (i: number) => setImages(images.filter((_, k) => k !== i));
  const makeFirst = (i: number) => setImages([images[i], ...images.filter((_, k) => k !== i)]);

  const addUrl = () => {
    const u = url.trim();
    if (!u) return;
    if (!/^(https?:\/\/|\/)/.test(u)) {
      setErr("Đường dẫn phải bắt đầu bằng https:// hoặc /sites/…");
      return;
    }
    setErr(null);
    setImages((prev) => (prev.includes(u) ? prev : [...prev, u]));
    setUrl("");
  };

  const upload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setErr(null);
    for (const file of Array.from(files)) {
      setBusy(file.name);
      try {
        const json = await uploadImage(file, "products");
        const img = json.image;
        setThumbs((prev) => ({ ...prev, [img]: json.thumb }));
        setImages((prev) => [...prev, img]);
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Không tải được ảnh");
      }
    }
    setBusy(null);
    if (fileInput.current) fileInput.current.value = "";
  };

  const first = images[0];
  const thumbValue = first ? thumbs[first] ?? "" : "";

  return (
    <div>
      <input type="hidden" name="images" value={images.join("\n")} readOnly />
      <input type="hidden" name="thumb" value={thumbValue} readOnly />

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className={adminLabel} htmlFor="image-files">
            Tải ảnh từ máy (JPG/PNG/WebP, tự thu nhỏ về tối đa 1200px)
          </label>
          <input
            ref={fileInput}
            id="image-files"
            type="file"
            accept="image/*"
            multiple
            disabled={!!busy}
            onChange={(e) => upload(e.target.files)}
            className={cn(adminInput, "cursor-pointer file:mr-3 file:rounded file:border-0 file:bg-lien-blue file:px-3 file:py-1 file:text-white")}
          />
        </div>
        <div>
          <label className={adminLabel} htmlFor="image-url">
            Hoặc thêm bằng đường dẫn
          </label>
          <div className="flex gap-2">
            <input
              id="image-url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addUrl();
                }
              }}
              placeholder="https://… hoặc /sites/lienstore/…"
              className={adminInput}
            />
            <button type="button" onClick={addUrl} className={btnSecondary}>
              Thêm
            </button>
          </div>
        </div>
      </div>
      {busy ? <p className="mt-2 text-[12px] text-lien-muted">Đang tải {busy}…</p> : null}
      {err || error ? <p className="mt-2 text-[12px] leading-4 text-red-600">{err ?? error}</p> : null}

      {images.length === 0 ? (
        <p className="mt-4 rounded-md border border-dashed border-[#d1d5db] p-4 text-center text-[13px] text-lien-muted">Chưa có ảnh. Cần ít nhất một ảnh để lưu sản phẩm.</p>
      ) : (
        <ul className="mt-4 grid list-none gap-3 p-0 sm:grid-cols-2 lg:grid-cols-3">
          {images.map((src, i) => (
            <li key={src} className={cn("flex gap-3 rounded-md border p-2", i === 0 ? "border-lien-blue bg-lien-blue-soft/40" : "border-[#e5e7eb]")}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={thumbs[src] ?? src} alt="" className="h-20 w-20 shrink-0 rounded border border-[#e5e7eb] bg-white object-cover" />
              <div className="min-w-0 flex-1">
                <div className="mb-1 flex items-center gap-2 text-[12px]">
                  {i === 0 ? <span className="rounded bg-lien-blue px-1.5 py-0.5 font-semibold text-white">Ảnh đại diện</span> : <span className="text-lien-muted">Ảnh {i + 1}</span>}
                  {src.startsWith("/api/files/") ? <span className="rounded bg-green-100 px-1.5 py-0.5 text-green-800">đã tải lên</span> : null}
                </div>
                <p className="m-0 truncate font-mono text-[11px] text-lien-muted" title={src}>
                  {src}
                </p>
                <div className="mt-2 flex flex-wrap gap-1 text-[12px]">
                  {i !== 0 ? (
                    <button type="button" onClick={() => makeFirst(i)} className="rounded border border-[#d1d5db] px-2 py-0.5 hover:bg-white">
                      Đặt đại diện
                    </button>
                  ) : null}
                  <button type="button" onClick={() => move(i, -1)} disabled={i === 0} className="rounded border border-[#d1d5db] px-2 py-0.5 hover:bg-white disabled:opacity-40">
                    ↑
                  </button>
                  <button type="button" onClick={() => move(i, 1)} disabled={i === images.length - 1} className="rounded border border-[#d1d5db] px-2 py-0.5 hover:bg-white disabled:opacity-40">
                    ↓
                  </button>
                  <button type="button" onClick={() => remove(i)} className="rounded border border-red-200 px-2 py-0.5 text-red-700 hover:bg-red-50">
                    Xoá
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-3 text-[12px] leading-4 text-lien-muted">
        Ảnh tải lên được lưu trong thư mục dữ liệu của cửa hàng (cùng nơi với cơ sở dữ liệu) và giữ nguyên khi cập nhật phiên bản. Ảnh đã xoá khỏi danh sách sẽ được dọn khỏi đĩa khi lưu sản phẩm nếu không còn sản phẩm nào dùng.
      </p>
    </div>
  );
}
