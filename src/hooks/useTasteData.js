// src/hooks/useTasteData.js
import { useEffect, useState } from "react";
import { num } from "../utils/sliderMapping';

export default function useTasteData() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setErr] = useState(null);

  useEffect(() => {
    const url = `${process.env.PUBLIC_URL || ""}/UMAP_PCA_coordinates.json`;
    fetch(url)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((raw) => {
        const cleaned = (raw || [])
          .filter(Boolean)
          .map((r) => ({
            JAN: String(r.JAN ?? ""),
            商品名: r["商品名"],
            Type: r.Type ?? "Other",
            // UMAP
            UMAP1: num(r.UMAP1),
            UMAP2: num(r.UMAP2),
            // PCA
            PC1: num(r.PC1),
            PC2: num(r.PC2),
          }))
          .filter(
            (r) =>
              Number.isFinite(r.UMAP1) &&
              Number.isFinite(r.UMAP2) &&
              r.JAN !== ""
          );

        setRows(cleaned);
      })
      .catch(setErr)
      .finally(() => setLoading(false));
  }, []);

  return { rows, loading, error };
}
