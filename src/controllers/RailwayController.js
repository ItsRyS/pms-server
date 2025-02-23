require('dotenv').config();
const axios = require('axios');

const RAILWAY_API_TOKEN = process.env.RAILWAY_API_TOKEN;
const PROJECT_ID = process.env.RAILWAY_PROJECT_ID;

const getRailwayServiceStatus = async (req, res) => {
  try {
    if (!RAILWAY_API_TOKEN || !PROJECT_ID) {
      return res.status(500).json({
        error: 'configuration',
        message: 'Missing API Token or Project ID',
      });
    }

    const response = await axios.post(
      'https://backboard.railway.app/graphql/v2',
      {
        query: `
          query {
            project(id: "${PROJECT_ID}") {
              services {
                id
                name
                serviceInstances {
                  id
                  state
                }
                latestDeployment {
                  id
                  status
                  createdAt
                  updatedAt
                }
              }
            }
          }
        `,
      },
      {
        headers: {
          Authorization: `Bearer ${RAILWAY_API_TOKEN}`,
          'Content-Type': 'application/json',
        },
      }
    );
    // ✅ เพิ่ม Debug Log
    console.log(
      'Railway API Response:',
      JSON.stringify(response.data, null, 2)
    );
    if (!response.data?.data?.project) {
      throw new Error('Invalid response from Railway API');
    }

    const services = response.data.data.project.services.map((service) => ({
      id: service.id,
      name: service.name,
      status: service.latestDeployment?.status || 'NO_DEPLOYMENT',
      state: service.serviceInstances?.[0]?.state || 'UNKNOWN',
      updatedAt: service.latestDeployment?.updatedAt || null,
    }));

    res.status(200).json({ services });
  } catch (error) {
    console.error('Railway service status error:', error);

    const errorResponse = {
      error: error.response?.data?.errors?.[0]?.message || error.message,
      message: 'Error fetching Railway service status',
    };

    res.status(500).json(errorResponse);
  }
};

module.exports = { getRailwayServiceStatus };
