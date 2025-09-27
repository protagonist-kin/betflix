import { NextResponse } from "next/server";

// Use the correct endpoint for getting VAA update data
const PYTH_VAA_URL = "https://hermes.pyth.network/api/latest_vaas";
const PYTH_PRICE_URL = "https://hermes.pyth.network/v2/updates/price/latest";

// Default to ETH/USD if no feed ID provided
const DEFAULT_FEED_ID = "0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const feedId = searchParams.get("feedId") || DEFAULT_FEED_ID;

    // Fetch price data from Pyth Hermes v2 API
    const response = await fetch(`${PYTH_PRICE_URL}?ids[]=${feedId}`);

    if (!response.ok) {
      throw new Error(`Hermes API error: ${response.statusText}`);
    }

    const data = await response.json();

    // Extract price from v2 API response
    const priceData = data.parsed?.[0];
    const price = priceData?.price?.price ? parseInt(priceData.price.price) * Math.pow(10, priceData.price.expo) : 0;

    return NextResponse.json({
      price,
      priceData,
    });
  } catch (error) {
    console.error("Error fetching Pyth price:", error);
    return NextResponse.json({ error: "Failed to fetch price data" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    let body;
    try {
      body = await request.json();
    } catch {
      // If body is empty or invalid JSON, use default
      body = {};
    }
    const priceId = body.priceId || DEFAULT_FEED_ID;

    // Fetch VAA (Verifiable Attestation) update data from Pyth
    const response = await fetch(`${PYTH_VAA_URL}?ids[]=${priceId}`);

    if (!response.ok) {
      throw new Error(`Pyth VAA API error: ${response.statusText}`);
    }

    const vaas = await response.json();

    // The VAA API returns an array of base64-encoded VAAs
    let updateData: string[];

    if (Array.isArray(vaas) && vaas.length > 0) {
      // Convert base64 VAAs to hex format for contract
      updateData = vaas.map((vaa: string) => "0x" + Buffer.from(vaa, "base64").toString("hex"));
    } else {
      console.error("No VAA data in response:", vaas);
      throw new Error("No VAA data in Pyth API response");
    }

    // Also fetch current price for display
    const priceResponse = await fetch(`${PYTH_PRICE_URL}?ids[]=${priceId}`);
    let currentPrice = 0;

    if (priceResponse.ok) {
      const priceData = await priceResponse.json();
      const parsed = priceData.parsed?.[0];
      if (parsed?.price?.price) {
        currentPrice = parseInt(parsed.price.price) * Math.pow(10, parsed.price.expo);
      }
    }

    return NextResponse.json({
      updateData,
      price: currentPrice,
    });
  } catch (error) {
    console.error("Error fetching Pyth update data:", error);
    return NextResponse.json({ error: "Failed to fetch update data" }, { status: 500 });
  }
}
