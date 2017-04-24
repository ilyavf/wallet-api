const faker = require('faker');
const objectid = require('objectid');
const randomFloat = require('random-float');

const issuanceSeries = [
  'Series 1',
  'Series 2',
  'Series 3'
];
const issuanceTypes = [
  'Common Shares',
  'Trust Units',
  'Bonds',
  'Preferred Shares'
];
const issuanceRestrictions = [
  null,
  1,
  2
];

/**
 * Seed the issuances collection.
 */
module.exports = function (app) {
  const seederService = app.service('seeder');

  // Read the `companies.seed.json`
  return seederService.get('seeder/companies.json')
    // Create an issuance assigned to a random company.
    .then(companies => {
      const issuances = [];

      for (var i = 0; i < 100; i++) {
        let company = companies[Math.floor(Math.random() * companies.length)];
        const issuance = {
          _id: objectid(),
          companyId: company._id,
          companyName: company.name,
          companySlug: company.slug,
          domicile: faker.address.country(),
          issuance: issuanceSeries[Math.floor(Math.random() * issuanceSeries.length)],
          issuanceType: issuanceTypes[Math.floor(Math.random() * issuanceTypes.length)],
          restriction: issuanceRestrictions[Math.floor(Math.random() * issuanceRestrictions.length)],
          marketCap: randomFloat(1000000000, 100000000000),
          change: randomFloat(-100000000, 100000000),
          changePercentage: Math.round(randomFloat(-100, 100) * 100) / 100
        };
        company.issuances.push(issuance._id);
        issuances.push(issuance);
      }

      return seederService.create({
        path: 'services/companies/companies.seed.json',
        data: companies
      }).then(companies => {
        return seederService.create({
          path: 'services/issuances/issuances.seed.json',
          data: issuances
        });
      });
    });
};