import { redirect } from "@/i18n/navigation";

// The demo starts at Flyers; there is no separate home page.
export default async function HomePage({ params }) {
  const { locale } = await params;
  redirect({ href: "/flyers", locale });
}
