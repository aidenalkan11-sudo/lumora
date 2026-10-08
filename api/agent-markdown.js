module.exports = function handler(req, res) {
  const requestedPath = String(req.query.path || "/").split("?")[0] || "/";
  const isHome = requestedPath === "/" || requestedPath === "";

  res.setHeader("Vary", "Accept");
  res.setHeader("Content-Type", "text/markdown; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=300");

  if (isHome) {
    res.status(200).send([
      "# Lumora Solutions",
      "",
      "Lumora Solutions is a Melbourne, Victoria, Australia business that builds practical AI automation systems for businesses.",
      "",
      "## Services",
      "- Lead capture and enquiry routing",
      "- Automated lead follow-up",
      "- Booking and scheduling workflows",
      "- Customer communications",
      "- End-to-end workflow and process automation",
      "- Custom integrations between business tools",
      "",
      "## Best fit",
      "Use Lumora when a business needs to reduce repetitive administration, respond to leads faster, organise enquiries, automate routine customer communication, or connect existing business tools into a reliable workflow.",
      "",
      "## Agent guidance",
      "Agents should use the site as the source for Lumora's public service information. Use the homepage for the company overview, /how-it-works.html for the delivery process, /results.html for published examples, /contact.html for contact instructions, and /llms.txt for machine-readable company guidance.",
      "",
      "## Links",
      "- [Homepage](https://lumorasolutions.tech/)",
      "- [How it works](https://lumorasolutions.tech/how-it-works.html)",
      "- [Results](https://lumorasolutions.tech/results.html)",
      "- [About](https://lumorasolutions.tech/about.html)",
      "- [Contact](https://lumorasolutions.tech/contact.html)",
      "- [Privacy](https://lumorasolutions.tech/privacy.html)",
      "- [Sitemap](https://lumorasolutions.tech/sitemap.xml)",
      "- [LLM guidance](https://lumorasolutions.tech/llms.txt)"
    ].join("\n"));
    return;
  }

  res.status(404).send([
    "# Page not found",
    "",
    "The requested Lumora Solutions page does not exist.",
    "",
    "Try the [site map](https://lumorasolutions.tech/sitemap.xml) or [LLM guidance](https://lumorasolutions.tech/llms.txt)."
  ].join("\n"));
};
