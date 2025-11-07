from dotenv import load_dotenv, find_dotenv
import os, httpx, asyncio, sys

# .env をロード（同ディレクトリ想定）
if not load_dotenv(find_dotenv()):
    print("⚠️ .env が読み込めていません（場所を確認）")
    # 続行はする

SHOPIFY_DOMAIN = os.getenv("SHOPIFY_SHOP_DOMAIN")
SHOPIFY_TOKEN  = os.getenv("SHOPIFY_STOREFRONT_TOKEN")

if not SHOPIFY_DOMAIN or not SHOPIFY_TOKEN:
    print("❌ 環境変数が不足: SHOPIFY_SHOP_DOMAIN / SHOPIFY_STOREFRONT_TOKEN")
    sys.exit(1)

async def fetch_shop_name():
    url = f"https://{SHOPIFY_DOMAIN}/api/2024-10/graphql.json"
    headers = {
        "Content-Type": "application/json",
        "X-Shopify-Storefront-Access-Token": SHOPIFY_TOKEN,
    }
    query = {"query": "{ shop { name } }"}
    async with httpx.AsyncClient(timeout=20) as client:
        r = await client.post(url, json=query, headers=headers)
        r.raise_for_status()
        print(r.json())

if __name__ == "__main__":
    asyncio.run(fetch_shop_name())
