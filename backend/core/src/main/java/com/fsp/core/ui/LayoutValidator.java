package com.fsp.core.ui;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fsp.core.common.ApiException;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

/**
 * Structural validation of a portal layout payload (plans/widget-harness-prd.md §3).
 * Pure-JSON checks only; i18n locales and relabel rules deepen in slice B. The layout is
 * stored verbatim once it passes this gate.
 */
@Slf4j
@Service
public class LayoutValidator {

    private final ObjectMapper mapper = new ObjectMapper();

    /** Validates and returns the normalized JSON string. */
    public String validate(String layoutJson) {
        JsonNode root;
        try {
            root = mapper.readTree(layoutJson);
        } catch (Exception e) {
            throw ApiException.badRequest("UI_LAYOUT_MALFORMED", "layout is not valid JSON");
        }
        if (root == null || !root.isObject()) {
            throw ApiException.badRequest("UI_LAYOUT_MALFORMED", "layout must be a JSON object");
        }
        requireText(root, "portal");
        JsonNode menus = root.get("menus");
        if (menus == null || !menus.isArray() || menus.isEmpty()) {
            throw ApiException.badRequest("UI_LAYOUT_MALFORMED", "layout needs at least one menu");
        }
        for (JsonNode menu : menus) {
            requireUid(menu, "menu");
            requireText(menu, "label");
            JsonNode screens = menu.get("screens");
            if (screens == null || !screens.isArray() || screens.isEmpty()) {
                throw ApiException.badRequest("UI_LAYOUT_MALFORMED", "menu '" + menu.path("id").asText() + "' needs screens");
            }
            for (JsonNode screen : screens) {
                requireUid(screen, "screen");
                requireText(screen, "label");
                JsonNode placed = screen.get("placedWidgets");
                if (placed != null && placed.isArray()) {
                    for (JsonNode w : placed) {
                        requireUid(w, "placedWidget");
                        requireText(w, "widgetId");
                        if (w.get("span") == null || !w.get("span").isObject()) {
                            throw ApiException.badRequest("UI_LAYOUT_MALFORMED",
                                    "widget '" + w.path("widgetId").asText() + "' needs a span tier object");
                        }
                    }
                }
            }
        }
        log.debug("ui_layout_validated portal={} menus={} ", root.path("portal").asText(), menus.size());
        return root.toString();
    }

    private void requireText(JsonNode node, String field) {
        if (node.get(field) == null || node.get(field).asText().isBlank()) {
            throw ApiException.badRequest("UI_LAYOUT_MALFORMED", "missing field '" + field + "'");
        }
    }

    private void requireUid(JsonNode node, String what) {
        JsonNode id = node.get("id");
        if (id == null || id.asText().isBlank()) {
            throw ApiException.badRequest("UI_LAYOUT_MALFORMED", "every " + what + " needs an id");
        }
    }
}
