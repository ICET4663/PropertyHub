// Photos bundled with the app for the demo portfolio, keyed by property id. Properties added in the app
// have none and fall back to the illustration. Stock photos from Unsplash (see assets/properties/CREDITS.md):
// they illustrate the kind of building, not the real address.
const PHOTOS: Record<string, number[]> = {
  'prop-palm': [require('../../assets/properties/palm-1.jpg'), require('../../assets/properties/palm-2.jpg')],
  'prop-bourdillon': [require('../../assets/properties/bourdillon-1.jpg'), require('../../assets/properties/bourdillon-2.jpg')],
  'prop-hm': [require('../../assets/properties/hm-1.jpg'), require('../../assets/properties/hm-2.jpg')],
  'prop-gbagada': [require('../../assets/properties/gbagada-1.jpg'), require('../../assets/properties/gbagada-2.jpg')],
  'prop-aminu': [require('../../assets/properties/aminu-1.jpg'), require('../../assets/properties/aminu-2.jpg')],
  'prop-adeola': [require('../../assets/properties/adeola-1.jpg'), require('../../assets/properties/adeola-2.jpg')],
  'prop-chevron': [require('../../assets/properties/chevron-1.jpg'), require('../../assets/properties/chevron-2.jpg')],
  'prop-addo': [require('../../assets/properties/addo-1.jpg'), require('../../assets/properties/addo-2.jpg')],
  'prop-isaacjohn': [require('../../assets/properties/isaacjohn-1.jpg'), require('../../assets/properties/isaacjohn-2.jpg')],
  'prop-maitama': [require('../../assets/properties/maitama-1.jpg'), require('../../assets/properties/maitama-2.jpg')],
  'prop-phgra': [require('../../assets/properties/phgra-1.jpg'), require('../../assets/properties/phgra-2.jpg')],
};

export function propertyPhotos(propertyId: string | undefined): number[] {
  return (propertyId && PHOTOS[propertyId]) || [];
}
