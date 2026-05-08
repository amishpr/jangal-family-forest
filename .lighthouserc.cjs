// Lighthouse CI (PLAN 10.5, W-5): Lighthouse mobile on the built site, best of three runs, against
// the speed and quality budgets: the privacy page, and the app at "/" with the sample family open.
const staticPage = '/privacy/'

module.exports = {
  ci: {
    collect: {
      staticDistDir: './dist',
      url: [`http://localhost${staticPage}`, 'http://localhost/?sample'],
      numberOfRuns: 3,
    },
    assert: {
      assertMatrix: [
        {
          matchingUrlPattern: `localhost(:\\d+)?${staticPage}$`,
          assertions: {
            'categories:performance': ['error', { minScore: 0.95 }],
            'categories:accessibility': ['error', { minScore: 1 }],
            'categories:best-practices': ['error', { minScore: 1 }],
            'categories:seo': ['error', { minScore: 1 }],
            'largest-contentful-paint': ['error', { maxNumericValue: 1500 }],
            'cumulative-layout-shift': ['error', { maxNumericValue: 0.05 }],
          },
        },
        {
          matchingUrlPattern: 'localhost(:\\d+)?/\\?sample$',
          assertions: {
            'categories:performance': ['error', { minScore: 0.9 }],
            'categories:accessibility': ['error', { minScore: 1 }],
            'largest-contentful-paint': ['error', { maxNumericValue: 2500 }],
            'cumulative-layout-shift': ['error', { maxNumericValue: 0.1 }],
          },
        },
      ],
    },
    upload: {
      target: 'filesystem',
      outputDir: '.lighthouseci',
    },
  },
}
