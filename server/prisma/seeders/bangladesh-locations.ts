import { prisma } from "../../src/lib/prisma";

const SOURCE_URL =
  process.env.BANGLADESH_LOCATIONS_SOURCE_URL ||
  "https://bangladesh.gov.bd/views/upazila-list/";

const divisionIds: Record<string, { id: string; nameEn: string }> = {
  ঢাকা: { id: "bd_division_dhaka", nameEn: "Dhaka" },
  খুলনা: { id: "bd_division_khulna", nameEn: "Khulna" },
  চট্টগ্রাম: { id: "bd_division_chattogram", nameEn: "Chattogram" },
  রাজশাহী: { id: "bd_division_rajshahi", nameEn: "Rajshahi" },
  সিলেট: { id: "bd_division_sylhet", nameEn: "Sylhet" },
  রংপুর: { id: "bd_division_rangpur", nameEn: "Rangpur" },
  ময়মনসিংহ: { id: "bd_division_mymensingh", nameEn: "Mymensingh" },
  বরিশাল: { id: "bd_division_barisal", nameEn: "Barishal" },
};

type ParsedUpazila = {
  id: string;
  nameBn: string;
  nameEn: string;
  sortName: string;
};

type ParsedDistrict = {
  id: string;
  nameBn: string;
  nameEn: string;
  sortName: string;
  upazilas: ParsedUpazila[];
};

type ParsedDivision = {
  id: string;
  nameBn: string;
  nameEn: string;
  sortName: string;
  districts: ParsedDistrict[];
};

function stripMarkup(value: string): string {
  return value
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function removeAdministrativeSuffix(value: string, suffix: string): string {
  return stripMarkup(value)
    .replace(new RegExp(`\\s*${suffix}\\s*$`), "")
    .replace(/\s*,\s*$/, "")
    .trim();
}

function sourceSlug(href: string): string {
  const hostname = new URL(href).hostname;
  return hostname.split(".")[0].replace(/[^a-z0-9-]/gi, "-").toLowerCase();
}

function titleFromSlug(slug: string): string {
  return slug
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function parseLocations(html: string): ParsedDivision[] {
  const divisions: ParsedDivision[] = [];
  const sectionPattern =
    /<h4>\s*([^<]+?)\s*বিভাগ\s*<\/h4>\s*<table[^>]*>([\s\S]*?)<\/table>/gi;

  for (const section of html.matchAll(sectionPattern)) {
    const divisionNameBn = stripMarkup(section[1]);
    const division = divisionIds[divisionNameBn];

    if (!division) {
      throw new Error(`Unknown division from source: ${divisionNameBn}`);
    }

    const districts: ParsedDistrict[] = [];
    const rowPattern = /<tr[^>]*class="division-row"[^>]*>([\s\S]*?)<\/tr>/gi;

    for (const row of section[2].matchAll(rowPattern)) {
      const rowHtml = row[1];
      const districtMatch = rowHtml.match(
        /class="district-name"[\s\S]*?<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i,
      );
      const upazilaCellMatch = rowHtml.match(
        /class="upazilas-list"[\s\S]*?>([\s\S]*?)<\/td>/i,
      );

      if (!districtMatch || !upazilaCellMatch) {
        continue;
      }

      const districtNameBn = removeAdministrativeSuffix(districtMatch[2], "জেলা");
      const districtSlug = sourceSlug(districtMatch[1]);
      const districtId = `${division.id}_district_${districtSlug}`;
      const upazilas: ParsedUpazila[] = [];
      const upazilaPattern =
        /<li[^>]*>[\s\S]*?<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;

      for (const upazilaMatch of upazilaCellMatch[1].matchAll(upazilaPattern)) {
        const nameBn = removeAdministrativeSuffix(upazilaMatch[2], "উপজেলা");
        const slug = sourceSlug(upazilaMatch[1]);

        upazilas.push({
          id: `${districtId}_upazila_${slug}`,
          nameBn,
          nameEn: titleFromSlug(slug),
          sortName: nameBn,
        });
      }

      districts.push({
        id: districtId,
        nameBn: districtNameBn,
        nameEn: titleFromSlug(districtSlug),
        sortName: districtNameBn,
        upazilas,
      });
    }

    divisions.push({
      id: division.id,
      nameBn: divisionNameBn,
      nameEn: division.nameEn,
      sortName: divisionNameBn,
      districts,
    });
  }

  if (divisions.length !== Object.keys(divisionIds).length) {
    throw new Error(
      `Expected ${Object.keys(divisionIds).length} divisions, found ${divisions.length}`,
    );
  }

  return divisions;
}

export async function seedBangladeshLocations() {
  const response = await fetch(SOURCE_URL);

  if (!response.ok) {
    throw new Error(`Location source returned HTTP ${response.status}`);
  }

  const locations = parseLocations(await response.text());
  let districtCount = 0;
  let upazilaCount = 0;

  await prisma.$transaction(async (transaction) => {
    for (const division of locations) {
      await transaction.division.upsert({
        where: { id: division.id },
        update: {
          nameBn: division.nameBn,
          nameEn: division.nameEn,
          sortName: division.sortName,
        },
        create: {
          id: division.id,
          nameBn: division.nameBn,
          nameEn: division.nameEn,
          sortName: division.sortName,
        },
      });

      for (const district of division.districts) {
        districtCount += 1;
        await transaction.district.upsert({
          where: { id: district.id },
          update: {
            divisionId: division.id,
            nameBn: district.nameBn,
            nameEn: district.nameEn,
            sortName: district.sortName,
          },
          create: {
            id: district.id,
            divisionId: division.id,
            nameBn: district.nameBn,
            nameEn: district.nameEn,
            sortName: district.sortName,
          },
        });

        for (const upazila of district.upazilas) {
          upazilaCount += 1;
          await transaction.upazila.upsert({
            where: { id: upazila.id },
            update: {
              districtId: district.id,
              nameBn: upazila.nameBn,
              nameEn: upazila.nameEn,
              sortName: upazila.sortName,
            },
            create: {
              id: upazila.id,
              districtId: district.id,
              nameBn: upazila.nameBn,
              nameEn: upazila.nameEn,
              sortName: upazila.sortName,
            },
          });
        }
      }
    }
  });

  return {
    divisions: locations.length,
    districts: districtCount,
    upazilas: upazilaCount,
    source: SOURCE_URL,
  };
}
