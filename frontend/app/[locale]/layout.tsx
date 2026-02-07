import {NextIntlClientProvider} from 'next-intl';
import {getMessages} from 'next-intl/server';
import { PrimeReactProvider } from 'primereact/api';
import HeaderComponent from "@/components/headerComponent";
import FooterComponent from "@/components/footerComponent";
import localFont from 'next/font/local';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: "Giorgio Privitera Lab",
  description: "Art gallery management system with customer and admin interfaces",
};

// Required for static export (output: 'export') - pre-render pages for each locale
export function generateStaticParams() {
  return [{locale: 'en'}, {locale: 'it'}];
}

const jungleFever = localFont({
  src: [
    {
      path: '../../public/fonts/JungleFeverNF.ttf',
      weight: '400',
      style: 'normal',
    },
  ],
  variable: '--font-junglefever',
  display: 'swap',
});

const kranji = localFont({
  src: [
    {
      path: '../../public/fonts/Skranji-Regular.ttf',
      weight: '400',
      style: 'normal',
    },
  ],
  variable: '--font-kranji',
  display: 'swap',
});

export default async function LocaleLayout({
  children,
  params
}: {
  children: React.ReactNode;
  params: Promise<{locale: string}>;
}) {
  // Await params before accessing properties
  const {locale} = await params;
  
  // Providing all messages to the client
  // side is the easiest way to get started
  const messages = await getMessages({locale});
 
  return (
    <html lang={locale} className={`${jungleFever.variable} ${kranji.variable}`}>
      <body className="antialiased min-h-screen flex flex-col overflow-x-hidden">
        <NextIntlClientProvider locale={locale} messages={messages}>
          <PrimeReactProvider>
            {/* Header sempre in alto e sticky - FUORI dal container principale */}
            <HeaderComponent />
            
            {/* Contenuto principale che si espande per riempire lo spazio disponibile */}
            <main className="flex-1 w-full overflow-x-hidden">
              {children}
            </main>

            {/* Footer sempre in basso */}
            <FooterComponent />
          </PrimeReactProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}