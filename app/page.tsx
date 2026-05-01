"use client";

import {
  FormEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

const WEBHOOK_BASE =
  "https://nextasia.app.n8n.cloud/webhook/ee28d078-59ea-4054-88d3-fed205d5c289";

type GeneratedField = {
  label: string;
  value: string;
};

type ApiResult = {
  salesMessage: string;
  generatedFields: GeneratedField[];
  scrapeWarning?: string;
};

const EMPTY_RESULT: ApiResult = {
  salesMessage: "",
  generatedFields: [],
  scrapeWarning: "一部取得失敗",
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
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ApiResult | null>(null);

  const formInvalid = !companyUrl.trim() || !contactUrl.trim();
  const submitDisabled = formInvalid || loading;
  const saveEnabled =
    result !== null && !error && !loading && !saving;

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (submitDisabled) return;

    console.log("submit start");
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyUrl: companyUrl.trim(),
          contactUrl: contactUrl.trim(),
        }),
      });

      let data: Partial<ApiResult> & { error?: string } = {};
      try {
        data = (await res.json()) as Partial<ApiResult> & { error?: string };
      } catch {
        throw new Error("レスポンスの解析に失敗しました。");
      }

      console.log("response:", { ok: res.ok, status: res.status, data });

      if (!res.ok) {
        throw new Error(data.error || "APIエラー");
      }

      if (data.error) {
        throw new Error(data.error);
      }

      const next: ApiResult = {
        salesMessage: typeof data.salesMessage === "string" ? data.salesMessage : "",
        generatedFields: Array.isArray(data.generatedFields)
          ? data.generatedFields
          : [],
        scrapeWarning: data.scrapeWarning,
      };

      setResult(next);
    } catch (err) {
      console.error(err);
      setError("処理中にエラーが発生しました。再試行してください。");
      setResult({ ...EMPTY_RESULT });
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!saveEnabled) return;

    const trimmedCompany = companyUrl.trim();
    const trimmedContact = contactUrl.trim();

    console.log("送信開始");
    console.log({ companyUrl: trimmedCompany, contactUrl: trimmedContact });

    const now = new Date();
    const jst = new Date(
      now.toLocaleString("en-US", { timeZone: "Asia/Tokyo" }),
    );
    const formattedTime =
      jst.getFullYear() +
      "年" +
      String(jst.getMonth() + 1).padStart(2, "0") +
      "月" +
      String(jst.getDate()).padStart(2, "0") +
      "日 " +
      String(jst.getHours()).padStart(2, "0") +
      ":" +
      String(jst.getMinutes()).padStart(2, "0");

    setSaving(true);
    try {
      const res = await fetch(WEBHOOK_BASE, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          companyUrl: trimmedCompany,
          contactUrl: trimmedContact,
          status: "完了",
          timestamp: formattedTime,
        }),
      });

      if (!res.ok) {
        throw new Error("Webhook送信失敗");
      }

      const data = await res.text();
      console.log("Webhook success:", data);

      alert("保存しました");
    } catch (err) {
      console.error("Webhook error:", err);
      alert("送信失敗");
    } finally {
      setSaving(false);
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
            disabled={loading || saving}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-slate-500 disabled:cursor-not-allowed disabled:bg-slate-100"
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
            disabled={loading || saving}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-slate-500 disabled:cursor-not-allowed disabled:bg-slate-100"
            required
          />
        </section>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={submitDisabled}
            className="rounded-lg bg-slate-900 px-6 py-2 font-medium text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-400"
          >
            {loading ? "処理中..." : "AIでスクレイピングする"}
          </button>
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={!saveEnabled || saving}
            className="rounded-lg border border-slate-300 bg-white px-6 py-2 font-medium text-slate-800 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? "送信中..." : "保存する"}
          </button>
        </div>
      </form>

      {loading && (
        <div className="mt-6 rounded-xl border border-blue-200 bg-white p-5 shadow-sm">
          <p className="mb-3 text-sm font-medium text-slate-700">
            AIが企業情報を解析中...
          </p>
          <div className="loading-bar" aria-hidden>
            <div className="loading-progress" />
          </div>
          <div className="loading-dot-track" aria-hidden>
            <div className="loading-dot" />
          </div>
        </div>
      )}

      {error && (
        <div
          className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4 text-red-700"
          role="alert"
        >
          {error}
        </div>
      )}

      {saving && !loading && (
        <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm text-slate-600">
          n8n へ送信中...
        </div>
      )}

      {result !== null && (
        <section className="mt-8 space-y-3">
          {result.scrapeWarning && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-900">
              {result.scrapeWarning}
            </div>
          )}

          {result.generatedFields.length === 0 ? (
            <p className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-slate-600">
              コピー用のフォーム項目がありません。
            </p>
          ) : (
            result.generatedFields.map((item, idx) => (
              <article
                key={`${item.label}-${idx}`}
                className="flex items-center justify-between gap-3 rounded-xl border bg-white p-4 shadow-sm"
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-600">
                    {item.label}
                  </p>
                  <p className="whitespace-pre-wrap break-all text-slate-900">
                    {item.value}
                  </p>
                </div>
                <CopyButton text={item.value} />
              </article>
            ))
          )}
        </section>
      )}
    </main>
  );
}
