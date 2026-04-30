import { docs_v1, google } from "googleapis";

function flattenDocText(content?: docs_v1.Schema$StructuralElement[]): string {
  if (!content) return "";

  return content
    .flatMap((item) =>
      item.paragraph?.elements?.map((el) => el.textRun?.content ?? "") ?? [],
    )
    .join("")
    .trim();
}

export async function getGoogleDocText(): Promise<string> {
  const docId = process.env.GOOGLE_DOC_ID;
  if (!docId) {
    throw new Error("GOOGLE_DOC_ID が未設定です。");
  }

  try {
    const docs = google.docs({ version: "v1" });
    const response = await docs.documents.get({ documentId: docId });
    const text = flattenDocText(response.data.body?.content ?? undefined);
    if (text) return text;
  } catch {
    // 非公開Docで認証が必要なケースを想定し、公開URL取得にフォールバック
  }

  const exportUrl = `https://docs.google.com/document/d/${docId}/export?format=txt`;
  const res = await fetch(exportUrl);
  if (!res.ok) {
    throw new Error("Google Docsの取得に失敗しました。公開設定を確認してください。");
  }
  return (await res.text()).trim();
}
