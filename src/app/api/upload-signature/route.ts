import { NextResponse } from "next/server";
import { v2 as cloudinary } from "cloudinary";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

export async function POST(req: Request) {
  try {
    const { image } = await req.json();

    if (!image) {
      return NextResponse.json({ error: "No image provided" }, { status: 400 });
    }

    const uploadResponse = await cloudinary.uploader.upload(image, {
      folder: "svs_billing_signatures",
      resource_type: "image",
    });

    return NextResponse.json({ url: uploadResponse.secure_url }, { status: 200 });
  } catch (error: any) {
    console.error("Cloudinary Upload Error:", error);
    return NextResponse.json({ error: "Failed to upload image" }, { status: 500 });
  }
}
