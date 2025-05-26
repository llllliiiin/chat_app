import React from "react";

interface Props {
  previewImage: string | null;
  onCancel: () => void;
  fileAttachment: string | null;
}

export default function AttachmentPreview({ previewImage, onCancel, fileAttachment }: Props) {
  if (!previewImage && !fileAttachment) return null;

  return (
    <div className="mb-2 relative w-fit">
      {previewImage && (
        <img src={previewImage} className="max-h-48 rounded shadow" alt="preview" />
      )}

      {fileAttachment && (
        <a
          href={fileAttachment}
          target="_blank"
          className="text-blue-600 underline text-sm block mt-2"
        >
          📎 添付ファイルを開く
        </a>
      )}

      <button
        onClick={onCancel}
        className="absolute -top-2 -right-2 bg-black text-white text-xs rounded-full w-5 h-5 flex items-center justify-center"
      >
        ×
      </button>
    </div>
  );
}
