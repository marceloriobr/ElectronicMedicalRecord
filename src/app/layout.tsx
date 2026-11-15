import type { Metadata } from "next";
import { Marcellus, Nunito_Sans } from "next/font/google";
import "./globals.css";

const marcellus = Marcellus({
  variable: "--font-marcellus",
  weight: "400",
  subsets: ["latin"],
});

const nunitoSans = Nunito_Sans({
  variable: "--font-nunito-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Prontuário Eletrônico | Dra. Verônica Avolio",
  description: "Prontuário eletrônico do consultório — Geriatria & Clínica Médica",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="pt-BR"
      className={`${marcellus.variable} ${nunitoSans.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col font-sans">{children}</body>
    </html>
  );
}
