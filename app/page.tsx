"use client";

import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

type GeneratedField = {
  fieldName: string;
  value: string;
};

type ApiResult = {
  salesMessage: string;
  generatedFields: GeneratedField[];
  error?: string;
};

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  const handleClick = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      return;
    }
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setCopied(true);
    timeoutRef.current = setTimeout(() => {
      setCopied(false);
      timeoutRef.current = null;
    }, 1500);
  }, [text]);

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-live="polite"
      className={`shrink-0 rounded-lg border px-3.5 py-2 text-sm font-medium shadow-sm outline-none transition-all duration-200 ease-out focus-visible:ring-2 focus-visible:ring-emerald-500/40 focus-visible:ring-offset-2 active:scale-[0.96] ${
        copied
          ? "scale-[1.02] border-emerald-600 bg-emerald-100 text-emerald-900 shadow-emerald-500/10"
          : "border-slate-300 bg-white text-slate-800 hover:scale-[1.03] hover:border-emerald-500 hover:bg-emerald-50/90 hover:text-emerald-900 hover:shadow-md"
      }`}
    >
      {copied ? "コピーしました" : "コピー"}
    </button>
  );
}

export default function HomePage() {
  const [companyUrl, setCompanyUrl] = useState("");
  const [contactUrl, setContactUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ApiResult | null>(null);

  const isDisabled = useMemo(
    () => !companyUrl.trim() || !contactUrl.trim() || loading,
    [companyUrl, contactUrl, loading],
  );

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyUrl, contactUrl }),
      });
      const data = (await res.json()) as ApiResult;

      if (!res.ok || data.error) {
        throw new Error(data.error || "生成に失敗しました。");
      }

      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "エラーが発生しました。");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="mx-auto min-h-screen max-w-4xl p-6 md:p-10">
      <h1 className="mb-8 text-2xl font-bold md:text-3xl">営業支援ツール</h1>

      <form onSubmit={handleSubmit} className="space-y-4">
        <section className="rounded-xl border bg-white p-5 shadow-sm">
          <label className="mb-2 block text-sm font-semibold text-slate-700">
            企業WebサイトURL
          </label>
          <input
            type="url"
            placeholder="https://example.com"
            value={companyUrl}
            onChange={(e) => setCompanyUrl(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-slate-500"
            required
          />
        </section>

        <section className="rounded-xl border bg-white p-5 shadow-sm">
          <label className="mb-2 block text-sm font-semibold text-slate-700">
            お問い合わせページURL
          </label>
          <input
            type="url"
            placeholder="https://example.com/contact"
            value={contactUrl}
            onChange={(e) => setContactUrl(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-slate-500"
            required
          />
        </section>

        <button
          type="submit"
          disabled={isDisabled}
          className="rounded-lg bg-slate-900 px-6 py-2 font-medium text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-400"
        >
          次へ
        </button>
      </form>

      {loading && (
        <div className="mt-6 rounded-xl border border-blue-200 bg-blue-50 p-4 text-blue-700">
          処理中です。自社情報を読み込み中（スプレッドシート）...
        </div>
      )}

      {error && (
        <div className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">
          {error}
        </div>
      )}

      {result && (
        <section className="mt-8 space-y-3">
          {result.generatedFields.map((item, idx) => (
            <article
              key={`${item.fieldName}-${idx}`}
              className="flex items-center justify-between gap-3 rounded-xl border bg-white p-4 shadow-sm"
            >
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-600">
                  {item.fieldName}
                </p>
                <p className="whitespace-pre-wrap break-all text-slate-900">
                  {item.value}
                </p>
              </div>
              <CopyButton text={item.value} />
            </article>
          ))}
        </section>
      )}
    </main>
  );
}
