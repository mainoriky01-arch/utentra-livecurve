// LiveCurve Full Extraction Script
// Runs in browser console on the product page
// Extracts all fan specs via AJAX API

const ALL_SERIES = [
  // High Pressure - AP
  {name: 'APE', id: 48, url: '/en/products/000048-high-pressure-ap-ape/'},
  {name: 'APF', id: 49, url: '/en/products/000049-high-pressure-ap-apf/'},
  {name: 'APG', id: 50, url: '/en/products/000050-high-pressure-ap-apg/'},
  // High Pressure - APc
  {name: 'APEc', id: 56, url: '/en/products/000056-high-pressure-apc-apec/'},
  {name: 'APFc', id: 57, url: '/en/products/000057-high-pressure-apc-apfc/'},
  {name: 'APGc', id: 58, url: '/en/products/000058-high-pressure-apc-apgc/'},
  // High Pressure - APR
  {name: 'APRF', id: 51, url: '/en/products/000051-high-pressure-apr-aprf/'},
  {name: 'APRG', id: 52, url: '/en/products/000052-high-pressure-apr-aprg/'},
  {name: 'APRH', id: 53, url: '/en/products/000053-high-pressure-apr-aprh/'},
  {name: 'APRI', id: 54, url: '/en/products/000054-high-pressure-apr-apri/'},
  {name: 'APRL', id: 55, url: '/en/products/000055-high-pressure-apr-aprl/'},
  // High Pressure - APR/N8
  {name: 'APRF/N8', id: 998, url: '/en/products/000998-high-pressure-apr-n8-aprf-n8/'},
  {name: 'APRG/N8', id: 999, url: '/en/products/000999-high-pressure-apr-n8-aprg-n8/'},
  {name: 'APRH/N8', id: 1000, url: '/en/products/001000-high-pressure-apr-n8-aprh-n8/'},
  {name: 'APRI/N8', id: 1001, url: '/en/products/001001-high-pressure-apr-n8-apri-n8/'},
  {name: 'APRL/N8', id: 1253, url: '/en/products/001253-high-pressure-apr-n8-aprl-n8/'},
  // High Pressure - APRc
  {name: 'APRFc', id: 59, url: '/en/products/000059-high-pressure-aprc-aprfc/'},
  {name: 'APRGc', id: 60, url: '/en/products/000060-high-pressure-aprc-aprgc/'},
  {name: 'APRHc', id: 61, url: '/en/products/000061-high-pressure-aprc-aprhc/'},
  {name: 'APRIc', id: 62, url: '/en/products/000062-high-pressure-aprc-apric/'},
  {name: 'APRLc', id: 63, url: '/en/products/000063-high-pressure-aprc-aprlc/'},
  // High Pressure - APRD
  {name: 'APRED', id: 1075, url: '/en/products/001075-high-pressure-aprd-apred/'},
  {name: 'APRFD', id: 1076, url: '/en/products/001076-high-pressure-aprd-aprfd/'},
  {name: 'APRGD', id: 1077, url: '/en/products/001077-high-pressure-aprd-aprgd/'},
  // Medium Pressure
  {name: 'EU', id: 16, url: '/en/products/000016-medium-pressure-eu/'},
  {name: 'EUc', id: 17, url: '/en/products/000017-medium-pressure-euc/'},
  {name: 'EUM', id: 18, url: '/en/products/000018-medium-pressure-eum/'},
  {name: 'EUK', id: 1297, url: '/en/products/001297-medium-pressure-euk/'},
  {name: 'EUKc', id: 1298, url: '/en/products/001298-medium-pressure-eukc/'},
  {name: 'EUMc', id: 19, url: '/en/products/000019-medium-pressure-eumc/'},
  {name: 'MPR', id: 20, url: '/en/products/000020-medium-pressure-mpr/'},
  {name: 'MPRc', id: 1278, url: '/en/products/001278-medium-pressure-mprc/'},
  {name: 'TF', id: 23, url: '/en/products/000023-medium-pressure-tf/'},
  {name: 'TFc', id: 21, url: '/en/products/000021-medium-pressure-tfc/'},
  {name: 'TG', id: 24, url: '/en/products/000024-medium-pressure-tg/'},
  {name: 'TGc', id: 22, url: '/en/products/000022-medium-pressure-tgc/'},
  {name: 'TH', id: 25, url: '/en/products/000025-medium-pressure-th/'},
  {name: 'THc', id: 1240, url: '/en/products/001240-medium-pressure-thc/'},
  {name: 'TPA', id: 27, url: '/en/products/000027-medium-pressure-tpa/'},
  {name: 'TPALc', id: 26, url: '/en/products/000026-medium-pressure-tpalc/'},
  {name: 'TQ', id: 28, url: '/en/products/000028-medium-pressure-tq/'},
  {name: 'TR', id: 30, url: '/en/products/000030-medium-pressure-tr/'},
  {name: 'TRc', id: 31, url: '/en/products/000031-medium-pressure-trc/'},
  {name: 'TTRc', id: 29, url: '/en/products/000029-medium-pressure-ttrc/'},
  // Low Pressure
  {name: 'BP', id: 32, url: '/en/products/000032-low-pressure-bp/'},
  {name: 'BPc', id: 34, url: '/en/products/000034-low-pressure-bpc/'},
  {name: 'BPR', id: 33, url: '/en/products/000033-low-pressure-bpr/'},
  {name: 'BPRc', id: 35, url: '/en/products/000035-low-pressure-bprc/'},
  {name: 'BPRDc', id: 36, url: '/en/products/000036-low-pressure-bprdc/'},
  {name: 'BT', id: 1296, url: '/en/products/001296-low-pressure-bt/'},
  // Axials
  {name: 'EVc', id: 40, url: '/en/products/000040-low-p-axials-evc/'},
  {name: 'EVF', id: 38, url: '/en/products/000038-low-p-axials-evf/'},
  {name: 'EVL', id: 39, url: '/en/products/000039-low-p-axials-evl/'},
  {name: 'EVP', id: 37, url: '/en/products/000037-low-p-axials-evp/'},
  {name: 'EVT', id: 41, url: '/en/products/000041-low-p-axials-evt/'},
];

module.exports = ALL_SERIES;
