import { NextResponse } from 'next/server';
import signpdf from 'node-signpdf';
import { plainAddPlaceholder } from 'node-signpdf/dist/helpers';

export async function POST(req: Request) {
  try {
    const { pdfBase64, p12Base64, password } = await req.json();

    if (!pdfBase64 || !p12Base64 || !password) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // Convert base64 to buffers
    const pdfBuffer = Buffer.from(pdfBase64, 'base64');
    const p12Buffer = Buffer.from(p12Base64, 'base64');

    // Add signature placeholder
    // plainAddPlaceholder requires a PDF string or buffer.
    const pdfWithPlaceholder = plainAddPlaceholder({
      pdfBuffer: pdfBuffer,
      reason: 'Invoice Digital Signature',
      location: 'System',
      contactInfo: 'admin@svsbilling.com',
      name: 'Digital Signature',
    });

    // Sign the PDF
    const signedPdf = signpdf.sign(pdfWithPlaceholder, p12Buffer, {
      passphrase: password,
    });

    // Convert signed PDF to base64 and return
    return NextResponse.json({ signedPdfBase64: signedPdf.toString('base64') }, { status: 200 });
  } catch (error: any) {
    console.error("Error signing PDF:", error);
    return NextResponse.json({ error: error.message || "Failed to sign PDF" }, { status: 500 });
  }
}
