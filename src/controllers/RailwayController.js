const axios = require("axios");

const RAILWAY_API_TOKEN = process.env.RAILWAY_API_TOKEN;
const PROJECT_ID = process.env.RAILWAY_PROJECT_ID;

const getRailwayServiceStatus = async (req, res) => {
  try {
    console.log("🔍 Checking Environment Variables...");
    console.log("RAILWAY_PROJECT_ID:", PROJECT_ID);
    console.log("RAILWAY_API_TOKEN:", RAILWAY_API_TOKEN ? "EXISTS" : "MISSING");

    if (!RAILWAY_API_TOKEN || !PROJECT_ID) {
      return res.status(500).json({ message: "Missing API Token or Project ID" });
    }

    const response = await axios.post(
      "https://backboard.railway.app/graphql/v2",
      {
        query: `
          query {
            project(id: "${PROJECT_ID}") {
              services {
                id
                name
                latestDeployment {
                  id
                  status
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
          "Content-Type": "application/json",
        },
      }
    );

    console.log("Railway API Response:", response.data);

    if (!response.data || !response.data.data || !response.data.data.project) {
      return res.status(500).json({ message: "Invalid response from Railway API", data: response.data });
    }

    const services = response.data.data.project.services.map((service) => ({
      id: service.id,
      name: service.name,
      status: service.latestDeployment ? service.latestDeployment.status : "UNKNOWN",
      updatedAt: service.latestDeployment ? service.latestDeployment.updatedAt : null,
    }));

    res.status(200).json({ services });
  } catch (error) {
    console.error("🚨 Error fetching Railway service status:", error.response ? error.response.data : error.message);
    res.status(500).json({ message: "Error fetching Railway service status", error: error.response ? error.response.data : error.message });
  }
};

module.exports = { getRailwayServiceStatus };
