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

    const fieldsWithFallback = generated.fields.map((field) => {
      const name = field.fieldName.toLowerCase();
      const isMessageField =
        name.includes("内容") ||
        name.includes("お問い合わせ") ||
        name.includes("message") ||
        name.includes("本文");

      return {
        ...field,
        value: isMessageField ? generated.salesMessage : field.value,
      };
    });

    const hasMessageField = fieldsWithFallback.some((field) => {
      const name = field.fieldName.toLowerCase();
      return (
        name.includes("内容") ||
        name.includes("お問い合わせ") ||
        name.includes("message") ||
        name.includes("本文")
      );
    });

    const finalFields = hasMessageField
      ? fieldsWithFallback
      : [
          ...fieldsWithFallback,
          { fieldName: "お問い合わせ内容", value: generated.salesMessage },
        ];

    return NextResponse.json({
      companyInfo,
      formFields,
      salesMessage: generated.salesMessage,
      generatedFields: finalFields,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "予期せぬエラーが発生しました。";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
