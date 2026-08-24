import { NextResponse } from "next/server";

function jsonError() {
  return NextResponse.json(
    {
      error: "not_found",
      message: "this api endpoint does not exist",
      resolution: "check the readme for available endpoints",
    },
    { status: 404 },
  );
}

export async function GET() {
  return jsonError();
}

export async function POST() {
  return jsonError();
}

export async function PUT() {
  return jsonError();
}

export async function DELETE() {
  return jsonError();
}
