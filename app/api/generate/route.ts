import { NextResponse } from "next/server";
import { scrapeCompanyInfo } from "@/lib/scraper";
import { parseFormFields } from "@/lib/formParser";
import { getCompanyProfileFromSheet } from "@/lib/googleSheets";
import { generateSalesAndFields } from "@/lib/openai";

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

    const generated = await generateSalesAndFields({
      ownCompanyInfo,
      targetCompany: companyInfo,
      formFields,
    });

    const fieldsWithFallback = generated.fields.map((field) => ({
      ...field,
      value:
        field.fieldName.includes("内容") && !field.value
          ? generated.salesMessage
          : field.value,
    }));

    return NextResponse.json({
      companyInfo,
      formFields,
      salesMessage: generated.salesMessage,
      generatedFields: fieldsWithFallback,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "予期せぬエラーが発生しました。";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
