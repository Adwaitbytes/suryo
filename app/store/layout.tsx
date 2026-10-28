import type { Metadata } from "next";
import Link from "next/link";
import { AskMeera } from "@/components/store/ask-meera";

export const metadata: Metadata = {
  title: { default: "Saanjh Studio, handloom everyday clothing", template: "%s · Saanjh Studio" },
  description: "Demo online store for Suryo. Saanjh Studio is a fictional handloom clothing label from Indore.",
};

const NAV = [
  { href: "/store?category=Kurtas#shop", label: "Kurtas" },
  { href: "/store?category=Dresses#shop", label: "Dresses" },
  { href: "/store?category=Shirts#shop", label: "Shirts" },
  { href: "/store/help", label: "Help" },
];

export default function StoreLayout({ children }: LayoutProps<"/store">) {
  return (
    <div className="flex min-h-screen flex-col bg-[#f6f1ea] text-[#201b16] [color-scheme:light] selection:bg-[#a8461f]/20 selection:text-[#201b16] [&_:focus-visible]:outline-[#a8461f]">
      <div className="bg-[#201b16] px-4 py-2 text-center text-[12px] tracking-[0.01em] text-[#f6f1ea]/80">
        Free shipping above ₹999 <span aria-hidden className="mx-2 text-[#f6f1ea]/35">/</span> Cash on delivery up to ₹5,000
      </div>

      <header className="sticky top-0 z-30 border-b border-[#201b16]/10 bg-[#f6f1ea]/90 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-6 px-4 sm:px-8">
          <Link href="/store" className="flex items-baseline gap-2" aria-label="Saanjh Studio home">
            <span className="font-display text-[28px] leading-none tracking-[-0.01em]">Saanjh</span>
            <span className="text-[10.5px] font-medium uppercase tracking-[0.28em] text-[#201b16]/55">Studio</span>
          </Link>
          <nav aria-label="Store" className="hidden items-center gap-8 text-[14px] text-[#201b16]/70 md:flex">
            {NAV.map((item) => (
              <Link key={item.href} href={item.href} className="transition-colors hover:text-[#201b16]">
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <Link href="/store/help" className="rounded-full px-3 py-2 text-[13px] text-[#201b16]/70 transition-colors hover:text-[#201b16] md:hidden">
              Help
            </Link>
            <AskMeera
              message="Where is my order?"
              className="rounded-full border border-[#201b16]/15 px-4 py-2 text-[13px] font-medium transition-colors hover:border-[#201b16] hover:bg-[#201b16] hover:text-[#f6f1ea]"
            >
              Track order
            </AskMeera>
          </div>
        </div>
      </header>

      <div className="flex-1">{children}</div>

      <footer className="border-t border-[#201b16]/10 bg-[#efe7dc]">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 py-14 sm:px-8 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div>
            <div className="flex items-baseline gap-2">
              <span className="font-display text-[26px] leading-none">Saanjh</span>
              <span className="text-[10.5px] font-medium uppercase tracking-[0.28em] text-[#201b16]/55">Studio</span>
            </div>
            <p className="mt-4 max-w-[34ch] text-[13.5px] leading-relaxed text-[#201b16]/65">
              Everyday kurtas, shirts and dresses in cotton and linen, made with handloom weavers from Maheshwar and Chanderi.
            </p>
          </div>
          <FooterCol
            title="Shop"
            links={[
              { href: "/store?category=Kurtas#shop", label: "Kurtas" },
              { href: "/store?category=Dresses#shop", label: "Dresses" },
              { href: "/store?category=Co-ord%20sets#shop", label: "Co-ord sets" },
              { href: "/store?category=Sale#shop", label: "Sale" },
            ]}
          />
          <FooterCol
            title="Help"
            links={[
              { href: "/store/help", label: "Track an order" },
              { href: "/store/help#returns", label: "Returns and exchanges" },
              { href: "/store/help#cancel", label: "Cancel an order" },
              { href: "/call/saanjh", label: "Call Meera" },
            ]}
          />
          <div>
            <h2 className="text-[11px] font-medium uppercase tracking-[0.18em] text-[#201b16]/50">Contact</h2>
            <ul className="mt-4 space-y-2.5 text-[13.5px] text-[#201b16]/75">
              <li>help@saanjhstudio.in</li>
              <li>+91 731 499 0100</li>
              <li>Mon to Fri, 9 AM to 9 PM</li>
              <li>Sat, 10 AM to 7 PM</li>
            </ul>
          </div>
        </div>
        <div className="border-t border-[#201b16]/10">
          <p className="mx-auto max-w-7xl px-4 py-5 text-[12px] text-[#201b16]/55 sm:px-8">Demo store for Suryo. Saanjh Studio is fictional.</p>
        </div>
      </footer>

      <script src="/widget.js" data-business="saanjh" data-label="Chat with Meera" async />
    </div>
  );
}

function FooterCol({ title, links }: { title: string; links: Array<{ href: string; label: string }> }) {
  return (
    <div>
      <h2 className="text-[11px] font-medium uppercase tracking-[0.18em] text-[#201b16]/50">{title}</h2>
      <ul className="mt-4 space-y-2.5 text-[13.5px]">
        {links.map((l) => (
          <li key={l.href}>
            <Link href={l.href} className="text-[#201b16]/75 transition-colors hover:text-[#201b16]">
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
