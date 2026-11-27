import type { ImageMetadata } from "astro";
import aisHdfReportImg from "../../assets/procurement/factories/credentials/ais-hdf-formaldehyde-e0-2026.webp";
import aisHmrReportImg from "../../assets/procurement/factories/credentials/ais-hmr-particleboard-formaldehyde-e0-2026.webp";
import aisOsbReportImg from "../../assets/procurement/factories/credentials/ais-osb-formaldehyde-enf-2026.webp";
import aisPurVocReportImg from "../../assets/procurement/factories/credentials/ais-pur-adhesive-voc-2024.webp";
import aisRohsReportImg from "../../assets/procurement/factories/credentials/ais-hot-melt-adhesive-rohs-2024.webp";
import aisBoardE1ReportImg from "../../assets/procurement/factories/credentials/ais-board-e1-2020.webp";
import aisWanhuaCertificateImg from "../../assets/procurement/factories/credentials/ais-wanhua-production-control-2015.webp";
import j2sFormaldehydeReportImg from "../../assets/procurement/factories/credentials/j2s-sofa-formaldehyde-e1-test-2021.webp";
import j2sE1CertificateImg from "../../assets/procurement/factories/credentials/j2s-sofa-e1-certificate-2020.webp";

export const FACTORY_DOCUMENTS_PATH = "/procurement/factory-documents";

export interface FactoryDocument {
  source: string;
  title: string;
  meta: string;
  description: string;
  image: ImageMetadata;
  alt: string;
}

export const factoryDocuments: readonly FactoryDocument[] = [
  {
    source: "AIS Smarti source package",
    title: "Marine HDF formaldehyde test",
    meta: "SGS SDHL260400719601HI | 15 June 2026 | 3 pages",
    description:
      "The report names AIS JOINERY PTY LTD as the applicant. It records a GB 18580-2025 E0 pass result for marine HDF.",
    image: aisHdfReportImg,
    alt: "First page of the AIS marine HDF formaldehyde test report",
  },
  {
    source: "AIS Smarti source package",
    title: "Hot-melt adhesive RoHS test",
    meta: "NPS2024030040 | 1 April 2024 | 6 pages",
    description:
      "This supplier report covers Foshan Yuetai hot-melt adhesive and records compliance with the stated EU RoHS limits.",
    image: aisRohsReportImg,
    alt: "Cover of the hot-melt adhesive RoHS test report",
  },
  {
    source: "J2S source package",
    title: "Sofa E1 certificate",
    meta: "ENC2012255GZ25 | 29 December 2020 | 1 page",
    description:
      "The certificate covers J2S JS and YX sofa series. It links its approval to test report ENC2012255GZ25E1.",
    image: j2sE1CertificateImg,
    alt: "J2S sofa E1 certification of conformity",
  },
  {
    source: "AIS Smarti source package",
    title: "HMR particleboard formaldehyde test",
    meta: "SGS SDHL260400719501HI | 15 June 2026 | 3 pages",
    description:
      "The report names AIS JOINERY PTY LTD as the applicant. It records a GB 18580-2025 E0 pass result for HMR particleboard.",
    image: aisHmrReportImg,
    alt: "First page of the AIS HMR particleboard formaldehyde test report",
  },
  {
    source: "AIS Smarti source package",
    title: "OSB formaldehyde test",
    meta: "SGS SDHL260400719701HI | 15 June 2026 | 3 pages",
    description:
      "The report names AIS JOINERY PTY LTD as the applicant. It records a GB/T 39600-2021 ENF pass result for oriented strand board.",
    image: aisOsbReportImg,
    alt: "First page of the AIS oriented strand board formaldehyde test report",
  },
  {
    source: "AIS Smarti source package",
    title: "PUR adhesive VOC test",
    meta: "SGS CANEC24022609601 | 21 October 2024 | 3 pages",
    description:
      "This supplier report covers polyurethane adhesive and records compliance with the GB 33372-2020 VOC limit.",
    image: aisPurVocReportImg,
    alt: "First page of the polyurethane adhesive VOC test report",
  },
  {
    source: "AIS Smarti source package",
    title: "E1 board formaldehyde report",
    meta: "Chinese-language supplier report | 18 April 2020 | 3 pages",
    description:
      "The AIS package included this Chinese-language board report. Review the source before you apply it to an order.",
    image: aisBoardE1ReportImg,
    alt: "Cover of the Chinese-language E1 board formaldehyde report",
  },
  {
    source: "AIS Smarti source package",
    title: "Wanhua Ecoboard production-control certificate",
    meta: "EPH 0766-CPR-338 | 4 June 2015 | image",
    description:
      "The certificate names Wanhua Ecoboard and particle board. It does not certify the AIS factory.",
    image: aisWanhuaCertificateImg,
    alt: "Wanhua Ecoboard factory production-control certificate",
  },
  {
    source: "J2S source package",
    title: "Sofa formaldehyde test",
    meta: "ENC2012255GZ25E1 | 4 January 2021 | 5 pages",
    description:
      "The report covers J2S JS and YX sofa series and tests formaldehyde emissions to EN 717-1:2004.",
    image: j2sFormaldehydeReportImg,
    alt: "Cover of the J2S sofa formaldehyde test report",
  },
];
