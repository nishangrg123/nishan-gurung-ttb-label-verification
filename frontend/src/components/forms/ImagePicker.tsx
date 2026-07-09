import { useEffect, useState } from "react";

type ImagePickerProps = {
  headingId: string;
  image: File | null;
  isSubmitting: boolean;
  onImageChange: (file: File | undefined) => void;
  nested?: boolean;
};

export function ImagePicker({
  headingId,
  image,
  isSubmitting,
  onImageChange,
  nested = false,
}: ImagePickerProps) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!image) {
      setPreviewUrl(null);
      return;
    }

    const objectUrl = URL.createObjectURL(image);
    setPreviewUrl(objectUrl);

    return () => URL.revokeObjectURL(objectUrl);
  }, [image]);

  return (
    <section className={nested ? "form-section nested-section" : "form-section"} aria-labelledby={headingId}>
      <h2 id={headingId}>Label Image</h2>
      <label className="file-picker">
        <span className="file-picker-label">Choose Label Image</span>
        <span className="file-picker-name">{image ? image.name : "Choose a photo or image file"}</span>
        <input
          type="file"
          accept="image/*"
          disabled={isSubmitting}
          onChange={(event) => onImageChange(event.target.files?.[0])}
        />
      </label>
      {previewUrl && image && (
        <figure className="image-preview">
          <img src={previewUrl} alt={`Preview of ${image.name}`} />
          <figcaption>Selected image preview</figcaption>
        </figure>
      )}
    </section>
  );
}
