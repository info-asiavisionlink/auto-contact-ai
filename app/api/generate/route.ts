import { NextResponse } from "next/server";
import { scrapeCompanyInfo } from "@/lib/scraper";
import { parseFormFields } from "@/lib/formParser";
import { getCompanyProfileFromSheet } from "@/lib/googleSheets";
import { generateSalesMessage } from "@/lib/openai";
import { buildFormFieldValues } from "@/lib/formFieldValues";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const companyUrl = body.companyUrl?.trim();
    const contactUrl = body.contactUrl?.trim();

    if (!companyUrl || !contactUrl) {
      return NextResponse.json(
        { error: "企業URLとお問い合わせURLは必須です。" },
        { status: 400 },
      );
    }

    const [companyOutcome, formOutcome, ownCompanyInfo] = await Promise.all([
      scrapeCompanyInfo(companyUrl),
      parseFormFields(contactUrl),
      getCompanyProfileFromSheet(),
    ]);

    const companyInfo = companyOutcome.data;
    const formFields = formOutcome.data;

    const scrapePartialFailure =
      !companyOutcome.success || !formOutcome.success;
    const scrapeWarning = scrapePartialFailure
      ? "一部サイトの取得に失敗しましたが、続行します"
      : undefined;

    const { salesMessage } = await generateSalesMessage({
      ownCompanyInfo,
      targetCompany: companyInfo,
      formFields,
    });

    const generatedFields = buildFormFieldValues(
      formFields,
      ownCompanyInfo,
      salesMessage,
    );

    return NextResponse.json({
      companyInfo,
      formFields,
      salesMessage,
      generatedFields,
      scrapeWarning,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "予期せぬエラーが発生しました。";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
