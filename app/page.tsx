import SiteView from "@/app/_components/site-view";
import { getPublicContent } from "@/lib/content";

export default async function Home() {
  const content = await getPublicContent();

  return <SiteView content={content} />;
}
