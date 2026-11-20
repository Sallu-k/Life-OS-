// What the editor may read and write for each collection: its folder, note type, image field,
// the frontmatter fields it accepts (with their kind) and the body sections it may edit.
export const COLLECTIONS = {
  books: {
    folder: "Collections/Books",
    type: "book",
    image: { field: "cover", dir: "covers" },
    fields: {
      title: "text", author: "text", status: "text", category: "text", published: "int", pages: "int",
      progress: "int", started: "date", finished: "month", rating: "rating", isbn: "text",
      special: "bool", note: "text", opinion: "text", cover: "path",
    },
    sections: ["Verdict", "Quotes", "Story of this copy"],
  },
  games: {
    folder: "Collections/Games",
    type: "game",
    image: { field: "poster", dir: "posters" },
    fields: {
      title: "text", platform: "text", status: "text", released: "int", developer: "text", publisher: "text",
      genres: "list", series: "text", progress: "int", started: "date", finished: "month", hours: "number",
      rating: "rating", note: "text", opinion: "text", moment: "text", poster: "path", backdrop: "path",
    },
    sections: ["Verdict", "The moment that stayed"],
  },
  certificates: {
    folder: "Collections/Certificates",
    type: "certificate",
    image: { field: "file", dir: "certs" },
    fields: { title: "text", issuer: "text", date: "date", category: "text", highlight: "bool", file: "path" },
    sections: [],
  },
  achievements: {
    folder: "Collections/Achievements",
    type: "achievement",
    image: { field: "image", dir: "achievements" },
    fields: { title: "text", date: "date", why: "text", area: "text", image: "path" },
    sections: [],
  },
};

// Turns an incoming value into what the note should hold, or throws a readable error.
export function cleanValue(kind, value, key) {
  if (value === null || value === undefined || value === "") return null;
  const fail = (why) => {
    throw new Error(`${key}: ${why}`);
  };
  switch (kind) {
    case "text":
    case "path":
      return String(value).trim().slice(0, 2000) || null;
    case "int": {
      const n = Number(value);
      return Number.isInteger(n) && n >= 0 ? n : fail("must be a whole number");
    }
    case "number": {
      const n = Number(value);
      return Number.isFinite(n) && n >= 0 ? n : fail("must be a number");
    }
    case "rating": {
      const n = Number(value);
      return Number.isInteger(n) && n >= 1 && n <= 5 ? n : fail("must be 1 to 5");
    }
    case "bool":
      return value === true || value === "true";
    case "date":
      return /^\d{4}-\d{2}-\d{2}$/.test(String(value)) ? String(value) : fail("must be YYYY-MM-DD");
    case "month":
      return /^\d{4}-\d{2}(-\d{2})?$/.test(String(value)) ? String(value).slice(0, 7) : fail("must be YYYY-MM");
    case "list":
      return (Array.isArray(value) ? value : String(value).split(",")).map((x) => String(x).trim()).filter(Boolean);
    default:
      return fail("unknown field");
  }
}
