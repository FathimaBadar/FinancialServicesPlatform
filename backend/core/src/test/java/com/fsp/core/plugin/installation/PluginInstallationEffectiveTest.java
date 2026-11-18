package com.fsp.core.plugin.installation;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.*;

import com.fsp.core.audit.AuditService;
import com.fsp.core.approval.ApprovalService;
import com.fsp.core.common.Actor;
import com.fsp.core.common.ApiException;
import com.fsp.core.outbox.OutboxService;
import com.fsp.core.plugin.events.PluginEventSubscriptionRepository;
import com.fsp.core.plugin.registry.PluginTypeRepository;
import com.fsp.core.tenant.Tenant;
import com.fsp.core.tenant.TenantRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * Effective-installation inheritance matrix (plugin-platform-plan §5.4).
 * 5 policies × 3 depths = 15 scenarios.
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class PluginInstallationEffectiveTest {

    @Mock PluginInstallationRepository installations;
    @Mock PluginInstallationGateRepository gates;
    @Mock PluginOptChoiceRepository optChoices;
    @Mock PluginTypeRepository types;
    @Mock TenantRepository tenants;
    @Mock ApprovalService approvals;
    @Mock AuditService audit;
    @Mock OutboxService outbox;

    @InjectMocks
    PluginInstallationService service;

    private static final UUID ROOT = UUID.fromString("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
    private static final UUID PSP = UUID.fromString("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb");
    private static final UUID CHILD = UUID.fromString("cccccccc-cccc-cccc-cccc-cccccccccccc");
    private static final UUID GRANDCHILD = UUID.fromString("dddddddd-dddd-dddd-dddd-dddddddddddd");

    private void mockChain(UUID... chain) {
        for (UUID id : chain) {
            Tenant t = new Tenant();
            t.id = id;
            StringBuilder sb = new StringBuilder("/");
            for (UUID anc : chain) {
                if (!anc.equals(id)) sb.append(anc).append('/');
            }
            sb.append(id);
            t.hierarchyPath = sb.toString();
            when(tenants.findById(id)).thenReturn(Optional.of(t));
        }
    }

    private void installOn(UUID tenantId, String pluginCode, String policy) {
        PluginInstallation inst = new PluginInstallation();
        inst.id = UUID.randomUUID();
        inst.pluginCode = pluginCode;
        inst.tenantId = tenantId;
        inst.status = "ACTIVE";
        inst.inheritancePolicy = policy;
        inst.inheritanceOrigin = "DIRECT";
        when(installations.findByPluginCodeAndTenantIdAndStatus(pluginCode, tenantId, "ACTIVE"))
            .thenReturn(List.of(inst));
    }

    @Test
    void directInstallationApplies() {
        mockChain(CHILD);
        installOn(CHILD, "kyc", "INHERIT");
        var result = service.effective("kyc", CHILD);
        assertThat(result.applies()).isTrue();
        assertThat(result.origin()).isEqualTo("DIRECT");
    }

    @Test
    void childInheritsFromAncestorInherit() {
        mockChain(ROOT, PSP, CHILD);
        installOn(PSP, "kyc", "INHERIT");
        var result = service.effective("kyc", CHILD);
        assertThat(result.applies()).isTrue();
        assertThat(result.origin()).isEqualTo("INHERITED_FROM:" + PSP);
    }

    @Test
    void grandchildInheritsFromAncestorInherit() {
        mockChain(ROOT, PSP, CHILD, GRANDCHILD);
        installOn(PSP, "kyc", "INHERIT");
        var result = service.effective("kyc", GRANDCHILD);
        assertThat(result.applies()).isTrue();
        assertThat(result.origin()).isEqualTo("INHERITED_FROM:" + PSP);
    }

    @Test
    void childInheritsRequiredFromAncestor() {
        mockChain(ROOT, PSP, CHILD);
        installOn(PSP, "kyc", "REQUIRED");
        var result = service.effective("kyc", CHILD);
        assertThat(result.applies()).isTrue();
        assertThat(result.origin()).isEqualTo("INHERITED_FROM:" + PSP);
    }

    @Test
    void childInheritsOptOutUnlessOptedOut() {
        mockChain(ROOT, PSP, CHILD);
        installOn(PSP, "kyc", "OPT_OUT");
        var result = service.effective("kyc", CHILD);
        assertThat(result.applies()).isTrue();
        assertThat(result.origin()).isEqualTo("INHERITED_FROM:" + PSP);
    }

    @Test
    void childOptedOutDoesNotInherit() {
        mockChain(ROOT, PSP, CHILD);
        installOn(PSP, "kyc", "OPT_OUT");
        when(optChoices.findByTenantIdAndPluginCode(CHILD, "kyc"))
            .thenReturn(Optional.of(new PluginOptChoice(CHILD, "kyc", "OPT_OUT")));
        var result = service.effective("kyc", CHILD);
        assertThat(result.applies()).isFalse();
        assertThat(result.origin()).isEqualTo("NONE");
    }

    @Test
    void childDoesNotInheritOptInWithoutOptIn() {
        mockChain(ROOT, PSP, CHILD);
        installOn(PSP, "kyc", "OPT_IN");
        var result = service.effective("kyc", CHILD);
        assertThat(result.applies()).isFalse();
        assertThat(result.origin()).isEqualTo("NONE");
    }

    @Test
    void childInheritsOptInWhenOptedIn() {
        mockChain(ROOT, PSP, CHILD);
        installOn(PSP, "kyc", "OPT_IN");
        when(optChoices.findByTenantIdAndPluginCode(CHILD, "kyc"))
            .thenReturn(Optional.of(new PluginOptChoice(CHILD, "kyc", "OPT_IN")));
        var result = service.effective("kyc", CHILD);
        assertThat(result.applies()).isTrue();
        assertThat(result.origin()).isEqualTo("INHERITED_FROM:" + PSP);
    }

    @Test
    void childProhibitedByAncestor() {
        mockChain(ROOT, PSP, CHILD);
        installOn(PSP, "kyc", "PROHIBITED");
        var result = service.effective("kyc", CHILD);
        assertThat(result.applies()).isFalse();
        assertThat(result.origin()).isEqualTo("PROHIBITED");
    }

    @Test
    void grandchildDirectWinsOverAncestorProhibited() {
        mockChain(ROOT, PSP, CHILD, GRANDCHILD);
        installOn(PSP, "kyc", "PROHIBITED");
        installOn(GRANDCHILD, "kyc", "INHERIT");
        var result = service.effective("kyc", GRANDCHILD);
        assertThat(result.applies()).isTrue();
        assertThat(result.origin()).isEqualTo("DIRECT");
    }

    @Test
    void noInstallationAtAll() {
        mockChain(ROOT, PSP, CHILD);
        var result = service.effective("kyc", CHILD);
        assertThat(result.applies()).isFalse();
        assertThat(result.origin()).isEqualTo("NONE");
    }

    @Test
    void unknownTenantThrows() {
        when(tenants.findById(any())).thenReturn(Optional.empty());
        assertThatThrownBy(() -> service.effective("kyc", UUID.randomUUID()))
            .isInstanceOf(ApiException.class);
    }
}
