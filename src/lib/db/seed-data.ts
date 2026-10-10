import type {
  AccountKind,
  CategoryKind,
  CategoryRole,
  CategoryScope,
  Direction,
  TaxGroup,
  VatCode,
} from "../types";

export interface SeedCategory {
  name: string;
  group: string;
  kind: CategoryKind;
  scope: CategoryScope;
  role?: CategoryRole;
  vat?: VatCode;
  taxGroup?: TaxGroup;
  deductiblePct?: number;
}

const p = (group: string, kind: CategoryKind, names: string[]): SeedCategory[] =>
  names.map((name) => ({ name, group, kind, scope: "personal" }));

/** Default personal finance categories (Dutch household oriented). */
export const PERSONAL_CATEGORIES: SeedCategory[] = [
  ...p("Income", "income", ["Salary"]),
  { name: "Income from own business", group: "Income", kind: "income", scope: "personal", role: "private" },
  ...p("Income", "income", [
    "Benefits & allowances",
    "Tax refunds",
    "Interest & investments",
    "Refunds & reimbursements",
    "Other income",
  ]),
  ...p("Housing", "expense", [
    "Rent / mortgage",
    "Energy",
    "Water",
    "Municipal taxes",
    "Home insurance",
    "Home & garden",
  ]),
  ...p("Bills & subscriptions", "expense", [
    "Internet & TV",
    "Mobile phone",
    "Streaming & subscriptions",
    "Memberships",
  ]),
  ...p("Insurance & health", "expense", [
    "Health insurance",
    "Other insurance",
    "Medical & pharmacy",
  ]),
  ...p("Daily life", "expense", ["Groceries", "Personal care", "Clothing", "Pets"]),
  ...p("Transport", "expense", [
    "Public transport",
    "Fuel & charging",
    "Car costs",
    "Parking & tolls",
    "Bicycle",
  ]),
  ...p("Food & going out", "expense", [
    "Restaurants & bars",
    "Takeaway & delivery",
    "Coffee & lunch",
  ]),
  ...p("Leisure", "expense", [
    "Holidays & travel",
    "Hobbies & entertainment",
    "Sports & fitness",
  ]),
  ...p("Shopping", "expense", ["Electronics", "General shopping"]),
  ...p("Family & education", "expense", ["Childcare", "Children", "Education"]),
  ...p("Giving", "expense", ["Gifts", "Charity & donations"]),
  ...p("Finance & taxes", "expense", [
    "Bank fees",
    "Income tax & other taxes",
    "Loan repayments",
    "Cash withdrawals",
  ]),
  { name: "Savings & investments", group: "Transfers", kind: "transfer", scope: "personal", role: "savings" },
  { name: "Internal transfer", group: "Transfers", kind: "transfer", scope: "personal", role: "internal_transfer" },
  { name: "Transfer to own business", group: "Transfers", kind: "transfer", scope: "personal", role: "private" },
  ...p("Other", "expense", ["Miscellaneous"]),
];

const b = (
  group: string,
  kind: CategoryKind,
  items: [name: string, vat: VatCode, taxGroup: TaxGroup | undefined, deductiblePct?: number][],
): SeedCategory[] =>
  items.map(([name, vat, taxGroup, deductiblePct]) => ({
    name,
    group,
    kind,
    scope: "business",
    vat,
    taxGroup,
    deductiblePct,
  }));

/** Default business categories, grouped along the Dutch profit & loss sections. */
export const BUSINESS_CATEGORIES: SeedCategory[] = [
  ...b("Revenue", "income", [
    ["Revenue", "high", "revenue"],
    ["Revenue (EU, reverse charge)", "eu", "revenue"],
    ["Revenue (outside EU)", "non_eu", "revenue"],
    ["Other business income", "none", "other_income"],
  ]),
  ...b("Cost of sales", "expense", [
    ["Subcontractors", "high", "purchase"],
    ["Materials & purchases", "high", "purchase"],
  ]),
  ...b("Office & equipment", "expense", [
    ["Office / coworking", "high", "housing"],
    ["Office supplies", "high", "other"],
    ["Small equipment (< €450)", "high", "other"],
  ]),
  { name: "Asset purchases (depreciated)", group: "Office & equipment", kind: "expense", scope: "business", role: "asset", vat: "high" },
  ...b("Software & IT", "expense", [
    ["Software & SaaS", "high", "other"],
    ["Hosting & domains", "high", "other"],
    ["Phone & internet", "high", "other"],
  ]),
  ...b("Travel & transport", "expense", [
    ["Public transport", "low", "car"],
    ["Car & fuel", "high", "car"],
    ["Parking", "high", "car"],
    ["Travel & accommodation", "high", "other"],
    ["Mileage allowance", "none", "car"],
  ]),
  ...b("Marketing & sales", "expense", [
    ["Advertising & marketing", "high", "sales"],
    ["Meals & representation", "low", "sales", 80],
    ["Client gifts", "high", "sales", 80],
  ]),
  ...b("Services & admin", "expense", [
    ["Accountant & administration", "high", "other"],
    ["Legal & advice", "high", "other"],
    ["Business insurance", "exempt", "other"],
    ["Bank fees", "exempt", "other"],
    ["Memberships & subscriptions", "high", "other"],
  ]),
  ...b("Development", "expense", [
    ["Training & courses", "high", "other"],
    ["Books & publications", "low", "other"],
  ]),
  ...b("Personnel", "expense", [["Personnel costs", "none", "personnel"]]),
  ...b("Other", "expense", [
    ["Other business costs", "high", "other"],
    ["Non-deductible costs", "none", "other", 0],
  ]),
  { name: "VAT payments & refunds", group: "Taxes & transfers", kind: "transfer", scope: "business", role: "vat", vat: "none" },
  { name: "Income tax & Zvw", group: "Taxes & transfers", kind: "transfer", scope: "business", role: "income_tax", vat: "none" },
  { name: "Private withdrawals & deposits", group: "Taxes & transfers", kind: "transfer", scope: "business", role: "private", vat: "none" },
  { name: "Internal transfer", group: "Taxes & transfers", kind: "transfer", scope: "business", role: "internal_transfer", vat: "none" },
];

export interface SeedRule {
  category: string;
  kind: AccountKind;
  counterparty?: string[];
  description?: string;
  direction?: Direction;
  vat?: VatCode;
  priority?: number;
}

/**
 * Starter rules for common Dutch merchants. They have the lowest precedence:
 * any rule you create yourself wins. Patterns match whole words, case-insensitive.
 */
export const STARTER_RULES: SeedRule[] = [
  // Personal
  {
    kind: "personal",
    category: "Groceries",
    counterparty: [
      "albert heijn", "ah to go", "jumbo", "lidl", "aldi", "dirk van den broek", "dirk vdbroek",
      "dekamarkt", "coop", "spar", "vomar", "hoogvliet", "picnic", "ekoplaza", "crisp",
      "poiesz", "nettorama", "plus supermarkt", "jan linders",
    ],
  },
  {
    kind: "personal",
    category: "Takeaway & delivery",
    counterparty: ["thuisbezorgd", "takeaway com", "uber eats", "deliveroo", "dominos", "new york pizza"],
  },
  {
    kind: "personal",
    category: "Public transport",
    counterparty: [
      "ns groep", "ns reizigers", "nederlandse spoorwegen", "ov chipkaart", "translink",
      "gvb", "htm", "arriva", "connexxion", "qbuzz", "keolis", "ovpay", "swapfiets",
    ],
  },
  {
    kind: "personal",
    category: "Fuel & charging",
    counterparty: ["shell", "esso", "tango", "tinq", "texaco", "totalenergies", "gulf", "avia", "fastned", "allego"],
  },
  {
    kind: "personal",
    category: "Streaming & subscriptions",
    counterparty: ["netflix", "spotify", "disney plus", "videoland", "hbo max", "viaplay", "youtube premium", "nlziet"],
  },
  { kind: "personal", category: "Internet & TV", counterparty: ["ziggo", "kpn", "delta fiber", "caiway"] },
  {
    kind: "personal",
    category: "Mobile phone",
    counterparty: ["vodafone", "odido", "t mobile", "simyo", "youfone", "hollandsnieuwe", "simpel", "lebara"],
  },
  {
    kind: "personal",
    category: "Energy",
    counterparty: [
      "eneco", "vattenfall", "essent", "greenchoice", "budget energie", "energiedirect",
      "vandebron", "pure energie", "frank energie", "tibber", "engie", "oxxio", "zonneplan",
    ],
  },
  {
    kind: "personal",
    category: "Water",
    counterparty: ["vitens", "waternet", "evides", "brabant water", "dunea", "pwn", "oasen", "wml"],
  },
  {
    kind: "personal",
    category: "Municipal taxes",
    counterparty: ["gemeente", "gemeentebelastingen", "waterschap", "hoogheemraadschap", "belastingsamenwerking", "bsgw", "svhw", "cocensus"],
  },
  {
    kind: "personal",
    category: "Health insurance",
    counterparty: [
      "zilveren kruis", "vgz", "menzis", "dsw", "onvz", "zorg en zekerheid", "anderzorg",
      "ditzo", "fbto", "zekur", "cz zorgverzekeringen", "cz groep",
    ],
  },
  { kind: "personal", category: "Benefits & allowances", counterparty: ["belastingdienst"], description: "toeslagen", direction: "in", priority: 2 },
  { kind: "personal", category: "Benefits & allowances", counterparty: ["svb", "uwv", "duo"], direction: "in" },
  { kind: "personal", category: "Tax refunds", counterparty: ["belastingdienst"], direction: "in" },
  { kind: "personal", category: "Income tax & other taxes", counterparty: ["belastingdienst"], direction: "out" },
  { kind: "personal", category: "Cash withdrawals", description: "geldautomaat" },
  { kind: "personal", category: "General shopping", counterparty: ["bol com", "amazon", "action", "hema", "blokker"] },
  { kind: "personal", category: "Electronics", counterparty: ["coolblue", "mediamarkt", "apple store"] },
  { kind: "personal", category: "Clothing", counterparty: ["zalando", "primark", "uniqlo", "wehkamp", "zara", "only for men", "we fashion"] },
  { kind: "personal", category: "Home & garden", counterparty: ["ikea", "praxis", "gamma", "karwei", "hornbach", "intratuin", "leen bakker"] },
  { kind: "personal", category: "Personal care", counterparty: ["kruidvat", "etos", "da drogist", "trekpleister"] },
  { kind: "personal", category: "Medical & pharmacy", counterparty: ["apotheek", "benu apotheek", "tandarts", "huisarts"] },
  { kind: "personal", category: "Sports & fitness", counterparty: ["basic fit", "sportcity", "trainmore", "anytime fitness", "decathlon"] },
  { kind: "personal", category: "Coffee & lunch", counterparty: ["starbucks", "coffee company", "bagels beans"] },
  {
    kind: "personal",
    category: "Charity & donations",
    counterparty: ["kwf", "unicef", "rode kruis", "greenpeace", "artsen zonder grenzen", "amnesty", "wnf", "natuurmonumenten"],
  },
  {
    kind: "personal",
    category: "Holidays & travel",
    counterparty: ["booking com", "airbnb", "klm", "transavia", "easyjet", "ryanair", "vueling", "corendon", "tui"],
  },
  {
    kind: "personal",
    category: "Parking & tolls",
    counterparty: ["q park", "parkmobile", "yellowbrick", "easypark", "parkeren"],
  },
  { kind: "personal", category: "Bank fees", description: "kosten oranjepakket" },
  { kind: "personal", category: "Bank fees", description: "kosten betaalpakket" },
  { kind: "personal", category: "Bank fees", description: "basic package" },

  // Business
  { kind: "business", category: "VAT payments & refunds", counterparty: ["belastingdienst"], description: "omzetbelasting", priority: 2 },
  { kind: "business", category: "VAT payments & refunds", counterparty: ["belastingdienst"], description: "btw", priority: 2 },
  { kind: "business", category: "Income tax & Zvw", counterparty: ["belastingdienst"], description: "inkomstenbelasting", priority: 2 },
  { kind: "business", category: "Income tax & Zvw", counterparty: ["belastingdienst"], description: "zvw", priority: 2 },
  // VAT defaults below assume the supplier bills you as a business (reverse charge). Check your invoices.
  { kind: "business", category: "Software & SaaS", counterparty: ["google", "microsoft", "adobe", "jetbrains", "dropbox", "slack"], vat: "eu" },
  { kind: "business", category: "Software & SaaS", counterparty: ["github"], vat: "non_eu" },
  { kind: "business", category: "Hosting & domains", counterparty: ["transip", "hostnet", "vimexx", "antagonist", "strato", "mijndomein"] },
  { kind: "business", category: "Hosting & domains", counterparty: ["amazon web services", "aws emea"], vat: "eu" },
  { kind: "business", category: "Hosting & domains", counterparty: ["vercel", "digitalocean", "netlify", "cloudflare"], vat: "non_eu" },
  {
    kind: "business",
    category: "Accountant & administration",
    counterparty: ["moneybird", "e boekhouden", "snelstart", "jortt", "rompslomp", "exact nederland", "tellow", "informer"],
  },
  { kind: "business", category: "Advertising & marketing", counterparty: ["linkedin", "meta platforms"], vat: "eu" },
  { kind: "business", category: "Public transport", counterparty: ["ns groep", "ns reizigers", "ov chipkaart", "translink", "ovpay"] },
  { kind: "business", category: "Other business costs", counterparty: ["kvk", "kamer van koophandel"], vat: "none" },
  { kind: "business", category: "Phone & internet", counterparty: ["kpn", "ziggo", "vodafone", "odido"] },
  { kind: "business", category: "Bank fees", description: "kosten", counterparty: ["knab", "bunq", "ing bank", "rabobank", "abn amro"], direction: "out" },
];
