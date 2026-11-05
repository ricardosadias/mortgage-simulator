import 'i18next';
import type common from '../locales/en/common.json';
import type mortgages from '../locales/en/mortgages.json';

declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'common';
    resources: {
      common: typeof common;
      mortgages: typeof mortgages;
    };
  }
}
