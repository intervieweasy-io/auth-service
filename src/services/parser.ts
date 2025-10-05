export const parseJobLink = async (sourceUrl: string) => {
  const url = new URL(sourceUrl);
  const host = url.hostname.toLowerCase();
  if (host.includes("greenhouse")) {
    return {
      title: "Engineer",
      company: url.hostname.split(".")[0],
      location: "",
    };
  }
  if (host.includes("lever")) {
    return {
      title: "Engineer",
      company: url.hostname.split(".")[0],
      location: "",
    };
  }
  return {
    title: "",
    company: url.hostname.replace("www.", ""),
    location: "",
  };
};
