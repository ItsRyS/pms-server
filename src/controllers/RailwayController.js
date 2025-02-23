const axios = require("axios");

const RAILWAY_API_TOKEN = process.env.RAILWAY_API_TOKEN; 
const PROJECT_ID = process.env.RAILWAY_PROJECT_ID;

const getRailwayStatus = async (req, res) => {
  try {
    const response = await axios.post(
      "https://backboard.railway.app/graphql/v2",
      {
        query: `
          query {
            project(id: "${PROJECT_ID}") {
              deployments(last: 5) {
                edges {
                  node {
                    id
                    status
                    createdAt
                    updatedAt
                  }
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

    const deployments = response.data.data.project.deployments.edges.map((edge) => ({
      id: edge.node.id,
      status: edge.node.status,
      createdAt: edge.node.createdAt,
      updatedAt: edge.node.updatedAt,
    }));

    res.status(200).json({ deployments });
  } catch (error) {
    console.error("Error fetching Railway status:", error);
    res.status(500).json({ message: "Error fetching Railway status" });
  }
};

module.exports = { getRailwayStatus };
