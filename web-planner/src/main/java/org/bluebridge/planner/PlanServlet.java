package org.bluebridge.planner;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServlet;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;

public class PlanServlet extends HttpServlet {
    private static final int MAX_BODY_BYTES = 100_000;
    private String jdbcUrl;

    @Override
    public void init() throws ServletException {
        String configuredPath = System.getProperty("bluebridge.db");
        if (configuredPath == null || configuredPath.trim().isEmpty()) {
            configuredPath = System.getenv("BLUEBRIDGE_DB");
        }
        if (configuredPath == null || configuredPath.trim().isEmpty()) {
            configuredPath = Paths.get(System.getProperty("user.home"), ".bluebridge", "planner.db").toString();
        }
        Path database = Paths.get(configuredPath).toAbsolutePath();
        try {
            Path parent = database.getParent();
            if (parent != null) Files.createDirectories(parent);
            jdbcUrl = "jdbc:sqlite:" + database;
            try (Connection connection = openConnection(); Statement statement = connection.createStatement()) {
                statement.execute("CREATE TABLE IF NOT EXISTS plans (id INTEGER PRIMARY KEY CHECK (id = 1), payload TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)");
            }
        } catch (IOException | SQLException exception) {
            throw new ServletException("Could not initialize the planner database", exception);
        }
    }

    private Connection openConnection() throws SQLException {
        return DriverManager.getConnection(jdbcUrl);
    }

    @Override
    protected void doGet(HttpServletRequest request, HttpServletResponse response) throws IOException {
        response.setContentType("application/json;charset=UTF-8");
        response.setHeader("Cache-Control", "no-store");
        JsonObject result = new JsonObject();
        try (Connection connection = openConnection();
             PreparedStatement query = connection.prepareStatement("SELECT payload, updated_at FROM plans WHERE id = 1");
             ResultSet row = query.executeQuery()) {
            if (row.next()) {
                result.add("plan", JsonParser.parseString(row.getString("payload")));
                result.addProperty("updatedAt", row.getString("updated_at"));
            } else {
                result.add("plan", null);
                result.add("updatedAt", null);
            }
            response.getWriter().write(result.toString());
        } catch (SQLException exception) {
            getServletContext().log("Could not read the saved planner plan", exception);
            response.sendError(HttpServletResponse.SC_INTERNAL_SERVER_ERROR, "Could not load the saved plan");
        }
    }

    @Override
    protected void doPost(HttpServletRequest request, HttpServletResponse response) throws IOException {
        request.setCharacterEncoding(StandardCharsets.UTF_8.name());
        response.setContentType("application/json;charset=UTF-8");
        response.setHeader("Cache-Control", "no-store");
        final JsonObject plan;
        try {
            byte[] body = request.getInputStream().readNBytes(MAX_BODY_BYTES + 1);
            if (body.length > MAX_BODY_BYTES) {
                response.sendError(HttpServletResponse.SC_REQUEST_ENTITY_TOO_LARGE, "Plan is too large");
                return;
            }
            String json = new String(body, StandardCharsets.UTF_8);
            JsonElement parsed = JsonParser.parseString(json);
            if (parsed == null || !parsed.isJsonObject()) throw new IllegalArgumentException("Expected a JSON object");
            plan = parsed.getAsJsonObject();
            JsonElement tasks = plan.get("tasks");
            if (tasks == null || !tasks.isJsonArray()) throw new IllegalArgumentException("Expected a tasks array");
            JsonArray taskArray = tasks.getAsJsonArray();
            if (taskArray.size() > 200) throw new IllegalArgumentException("Too many milestones");
        } catch (RuntimeException exception) {
            response.sendError(HttpServletResponse.SC_BAD_REQUEST, "Invalid plan JSON");
            return;
        }

        try (Connection connection = openConnection();
             PreparedStatement save = connection.prepareStatement(
                     "INSERT INTO plans (id, payload, updated_at) VALUES (1, ?, CURRENT_TIMESTAMP) " +
                             "ON CONFLICT(id) DO UPDATE SET payload=excluded.payload, updated_at=CURRENT_TIMESTAMP")) {
            save.setString(1, plan.toString());
            save.executeUpdate();
            response.getWriter().write("{\"ok\":true}");
        } catch (SQLException exception) {
            getServletContext().log("Could not save the planner plan", exception);
            response.sendError(HttpServletResponse.SC_INTERNAL_SERVER_ERROR, "Could not save the plan");
        }
    }
}
