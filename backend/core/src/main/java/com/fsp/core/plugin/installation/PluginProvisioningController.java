package com.fsp.core.plugin.installation;

import com.fsp.core.common.Actor;
import com.fsp.core.common.ApiException;
import com.fsp.core.common.FspOperation;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

/**
 * GET /v1/plugins/{pluginCode}/installations/provisioning — the approved installations a
 * plugin still has to make ready (it then reports each readiness gate). Machine-only, and
 * only the plugin's OWN client (plugin-&lt;code&gt;) may read its installations.
 */
@RestController
public class PluginProvisioningController {

    private final PluginInstallationRepository installations;

    public PluginProvisioningController(PluginInstallationRepository installations) {
        this.installations = installations;
    }

    @FspOperation(id = "plugin.installation.provisioning", component = "platform", permission = "plugin.manage",
        risk = FspOperation.OperationRisk.READ,
        title = "List a plugin's installations awaiting readiness (machine)",
        actors = {Actor.ActorType.MACHINE})
    @GetMapping("/v1/plugins/{pluginCode}/installations/provisioning")
    public List<Map<String, Object>> provisioning(@PathVariable("pluginCode") String pluginCode,
                                                  HttpServletRequest request) {
        Actor actor = (Actor) request.getAttribute("fsp.actor");
        if (actor == null || !("plugin-" + pluginCode).equals(actor.clientId())) {
            throw ApiException.forbidden("PLUGIN_CLIENT_MISMATCH", "only the plugin's own client may read its installations");
        }
        return installations.findByPluginCodeAndStatus(pluginCode, "PROVISIONING").stream()
            .map(i -> Map.<String, Object>of("installationId", i.id, "tenantId", i.tenantId, "version", i.pluginVersion))
            .toList();
    }
}
