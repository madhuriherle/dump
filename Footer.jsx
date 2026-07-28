import React from 'react';

const Footer = () => {
  const year = new Date().getFullYear();

  return (
    <footer className="w-full bg-[#1a1a1a] text-[#999] font-sans">
      <div className="px-4 py-4 sm:px-6 lg:px-8">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4 text-[13px]">
          <div className="text-center md:text-left">
            © Anegudde Inventory Management System (AIMS) {year} All right reserved
          </div>

          <div className="flex items-center gap-2">
            <span>Developed By</span>
            <a
              href="http://www.d-apps.in/"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 hover:text-white transition-colors">
              
              <img
                src="/images/d-apps.png"
                alt="D-apps logo"
                className="w-5 h-5" />
              
              <span>D-apps.in, Kumbhasi.</span>
            </a>
          </div>
        </div>
      </div>
    </footer>);

};

export default Footer;