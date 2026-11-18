package com.fsp.plugin.kyc.api;

import com.fsp.plugin.kyc.service.KycMasterService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** kyc.master.list — GET /master-values?category= (§12.4). */
@RestController
@RequestMapping("/v1/plugins/kyc")
public class KycMasterController {

    private final KycMasterService masterService;

    public KycMasterController(KycMasterService masterService) {
        this.masterService = masterService;
    }

    @GetMapping("/master-values")
    public KycDtos.MasterListResponse list(@RequestParam(value = "category", required = false) String category) {
        return masterService.list(category);
    }
}
