import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.js");

/** @type {import('next').NextConfig} */
const nextConfig = {
  allowedDevOrigins: ["127.0.0.1"],
  // The first-draft standalone upload page is gone; the Flyers configurator is
  // the only upload surface, so old links land there.
  async redirects() {
    return [
      { source: "/order/upload", destination: "/flyers", permanent: false },
      { source: "/:locale(en|ar)/order/upload", destination: "/:locale/flyers", permanent: false },
    ];
  },
};

export default withNextIntl(nextConfig);
