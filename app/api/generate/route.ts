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

    const [companyInfo, formFields, ownCompanyInfo] = await Promise.all([
      scrapeCompanyInfo(companyUrl),
      parseFormFields(contactUrl),
      getCompanyProfileFromSheet(),
    ]);

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
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "予期せぬエラーが発生しました。";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
