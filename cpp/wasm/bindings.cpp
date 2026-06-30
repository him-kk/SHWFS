// /*
//  * WebAssembly Bindings for AO-Pro
//  * Exports C functions to JavaScript via Emscripten
//  */

// #include <emscripten/bind.h>
// #include <emscripten/val.h>
// #include <cstring>
// #include <cmath>

// extern "C" {
// #include "ao_core.h"
// }

// using namespace emscripten;

// /* ============================================================================
//  * CONFIGURATION WRAPPER
//  * ============================================================================ */

// class AOConfig {
// public:
//     ao_config_t config;
    
//     AOConfig() {
//         ao_config_init_default(&config);
//     }
    
//     // Getters
//     int getCentroidMethod() const { return config.centroid_method; }
//     int getReconMethod() const { return config.recon_method; }
//     int getControlMethod() const { return config.control_method; }
//     int getNZernikeModes() const { return config.n_zernike_modes; }
//     double getLambda() const { return config.regularization_lambda; }
//     double getTelescopeD() const { return config.telescope_d; }
//     double getWavelength() const { return config.wavelength; }
//     double getSampleRate() const { return config.sample_rate_hz; }
//     double getMaxStroke() const { return config.dm_max_stroke; }
//     double getCoupling() const { return config.dm_coupling; }
//     double getLatency() const { return config.max_latency_ms; }
//     double getTargetStrehl() const { return config.target_strehl; }
//     int getEnableHysteresis() const { return config.enable_hysteresis; }
//     int getEnableSPGD() const { return config.enable_spgd; }
    
//     // Setters
//     void setCentroidMethod(int v) { config.centroid_method = v; }
//     void setReconMethod(int v) { config.recon_method = v; }
//     void setControlMethod(int v) { config.control_method = v; }
//     void setNZernikeModes(int v) { config.n_zernike_modes = v; }
//     void setLambda(double v) { config.regularization_lambda = v; }
//     void setTelescopeD(double v) { config.telescope_d = v; }
//     void setWavelength(double v) { config.wavelength = v; }
//     void setSampleRate(double v) { config.sample_rate_hz = v; }
//     void setMaxStroke(double v) { config.dm_max_stroke = v; }
//     void setCoupling(double v) { config.dm_coupling = v; }
//     void setLatency(double v) { config.max_latency_ms = v; }
//     void setTargetStrehl(double v) { config.target_strehl = v; }
//     void setEnableHysteresis(int v) { config.enable_hysteresis = v; }
//     void setEnableSPGD(int v) { config.enable_spgd = v; }
// };

// /* ============================================================================
//  * SUBAPERTURE CONFIGURATION WRAPPER
//  * ============================================================================ */

// class AOSubapConfig {
// public:
//     ao_subap_config_t cfg;
    
//     AOSubapConfig() {
//         memset(&cfg, 0, sizeof(cfg));
//     }
    
//     void setup(int gridX, int gridY, int subapSize, double pitchPixels, 
//                double pitchMeters, double focalLength) {
//         cfg.grid_x = gridX;
//         cfg.grid_y = gridY;
//         cfg.subap_size = subapSize;
//         cfg.pitch_pixels = pitchPixels;
//         cfg.pitch_meters = pitchMeters;
//         cfg.focal_length = focalLength;
//     }
// };

// /* ============================================================================
//  * FRAME METADATA WRAPPER
//  * ============================================================================ */

// class AOFrameMeta {
// public:
//     ao_frame_metadata_t meta;
    
//     AOFrameMeta() {
//         memset(&meta, 0, sizeof(meta));
//     }
    
//     void setup(int width, int height, double exposure, double gain) {
//         meta.width = width;
//         meta.height = height;
//         meta.exposure_ms = exposure;
//         meta.gain = gain;
//         meta.bit_depth = 16;
//     }
// };

// /* ============================================================================
//  * PIPELINE RESULT WRAPPER
//  * ============================================================================ */

// class AOPipelineResult {
// public:
//     ao_pipeline_result_t result;
    
//     AOPipelineResult() {
//         memset(&result, 0, sizeof(result));
//     }
    
//     ~AOPipelineResult() {
//         ao_free_result(&result);
//     }
    
//     double getStrehl() const { return result.strehl_ratio; }
//     double getRMS() const { return result.rms_error; }
//     double getBandwidth() const { return result.loop_bandwidth_hz; }
//     double getLatency() const { return result.latency_ms; }
//     int getNValid() const { return result.n_centroids_valid; }
//     int getStatus() const { return result.status; }
    
//     val getWavefront(int nx, int ny) const {
//         if (!result.wavefront.phase || nx * ny == 0) {
//             return val::array();
//         }
//         return val(typed_memory_view(nx * ny, result.wavefront.phase));
//     }
    
//     val getDMCommands(int nAct) const {
//         if (!result.dm_commands || nAct == 0) {
//             return val::array();
//         }
        
//         std::vector<double> cmds(nAct);
//         for (int i = 0; i < nAct; i++) {
//             cmds[i] = result.dm_commands[i].command;
//         }
//         return val(cmds);
//     }
    
//     val getCentroids(int nSubaps) const {
//         if (!result.centroids || nSubaps == 0) {
//             return val::array();
//         }
        
//         std::vector<double> cents(nSubaps * 3);
//         for (int i = 0; i < nSubaps; i++) {
//             cents[i * 3 + 0] = result.centroids[i].x;
//             cents[i * 3 + 1] = result.centroids[i].y;
//             cents[i * 3 + 2] = result.centroids[i].valid ? result.centroids[i].quality : -1;
//         }
//         return val(cents);
//     }
    
//     val getSlopes(int nSubaps) const {
//         if (!result.slopes.gx || !result.slopes.gy || nSubaps == 0) {
//             return val::array();
//         }
        
//         std::vector<double> slopes(nSubaps * 2);
//         for (int i = 0; i < nSubaps; i++) {
//             slopes[i * 2 + 0] = result.slopes.gx[i];
//             slopes[i * 2 + 1] = result.slopes.gy[i];
//         }
//         return val(slopes);
//     }
// };

// /* ============================================================================
//  * MAIN PIPELINE CLASS
//  * ============================================================================ */

// class AOPipeline {
// public:
//     int processFrame(val frameData, AOFrameMeta& meta, AOSubapConfig& subap, 
//                      AOConfig& config, AOPipelineResult& result) {
        
//         unsigned int length = frameData["length"].as<unsigned int>();
//         std::vector<uint16_t> frame(length);
        
//         val memoryView = val::global("Uint16Array").new_(val::module_property("HEAPU16"),
//             reinterpret_cast<uintptr_t>(frame.data()), length);
//         memoryView.call<void>("set", frameData);
        
//         return ao_process_pipeline(frame.data(), nullptr, nullptr, 
//                                    &meta.meta, &subap.cfg, &config.config, 
//                                    &result.result);
//     }
// };

// /* ============================================================================
//  * UTILITY FUNCTIONS
//  * ============================================================================ */

// double computeStrehl(double rms) {
//     return ao_compute_strehl(rms);
// }

// double computeRMS(val data) {
//     unsigned int len = data["length"].as<unsigned int>();
//     std::vector<double> buf(len);
    
//     val memoryView = val::global("Float64Array").new_(val::module_property("HEAPF64"),
//         reinterpret_cast<uintptr_t>(buf.data()), len);
//     memoryView.call<void>("set", data);
    
//     return ao_compute_rms(buf.data(), len);
// }

// val getVersion() {
//     return val("AO-Pro v1.0.0 - Adaptive Optics Processing System");
// }

// /* ============================================================================
//  * EMSCRIPTEN BINDINGS
//  * ============================================================================ */

// EMSCRIPTEN_BINDINGS(ao_pro) {
//     class_<AOConfig>("AOConfig")
//         .constructor()
//         .function("getCentroidMethod", &AOConfig::getCentroidMethod)
//         .function("getReconMethod", &AOConfig::getReconMethod)
//         .function("getControlMethod", &AOConfig::getControlMethod)
//         .function("getNZernikeModes", &AOConfig::getNZernikeModes)
//         .function("getLambda", &AOConfig::getLambda)
//         .function("getTelescopeD", &AOConfig::getTelescopeD)
//         .function("getWavelength", &AOConfig::getWavelength)
//         .function("getSampleRate", &AOConfig::getSampleRate)
//         .function("getMaxStroke", &AOConfig::getMaxStroke)
//         .function("getCoupling", &AOConfig::getCoupling)
//         .function("getLatency", &AOConfig::getLatency)
//         .function("getTargetStrehl", &AOConfig::getTargetStrehl)
//         .function("getEnableHysteresis", &AOConfig::getEnableHysteresis)
//         .function("getEnableSPGD", &AOConfig::getEnableSPGD)
//         .function("setCentroidMethod", &AOConfig::setCentroidMethod)
//         .function("setReconMethod", &AOConfig::setReconMethod)
//         .function("setControlMethod", &AOConfig::setControlMethod)
//         .function("setNZernikeModes", &AOConfig::setNZernikeModes)
//         .function("setLambda", &AOConfig::setLambda)
//         .function("setTelescopeD", &AOConfig::setTelescopeD)
//         .function("setWavelength", &AOConfig::setWavelength)
//         .function("setSampleRate", &AOConfig::setSampleRate)
//         .function("setMaxStroke", &AOConfig::setMaxStroke)
//         .function("setCoupling", &AOConfig::setCoupling)
//         .function("setLatency", &AOConfig::setLatency)
//         .function("setTargetStrehl", &AOConfig::setTargetStrehl)
//         .function("setEnableHysteresis", &AOConfig::setEnableHysteresis)
//         .function("setEnableSPGD", &AOConfig::setEnableSPGD)
//         ;
    
//     class_<AOSubapConfig>("AOSubapConfig")
//         .constructor()
//         .function("setup", &AOSubapConfig::setup)
//         ;
    
//     class_<AOFrameMeta>("AOFrameMeta")
//         .constructor()
//         .function("setup", &AOFrameMeta::setup)
//         ;
    
//     class_<AOPipelineResult>("AOPipelineResult")
//         .constructor()
//         .function("getStrehl", &AOPipelineResult::getStrehl)
//         .function("getRMS", &AOPipelineResult::getRMS)
//         .function("getBandwidth", &AOPipelineResult::getBandwidth)
//         .function("getLatency", &AOPipelineResult::getLatency)
//         .function("getNValid", &AOPipelineResult::getNValid)
//         .function("getStatus", &AOPipelineResult::getStatus)
//         .function("getWavefront", &AOPipelineResult::getWavefront)
//         .function("getDMCommands", &AOPipelineResult::getDMCommands)
//         .function("getCentroids", &AOPipelineResult::getCentroids)
//         .function("getSlopes", &AOPipelineResult::getSlopes)
//         ;
    
//     class_<AOPipeline>("AOPipeline")
//         .constructor()
//         .function("processFrame", &AOPipeline::processFrame)
//         ;
    
//     function("computeStrehl", &computeStrehl);
//     function("computeRMS", &computeRMS);
//     function("getVersion", &getVersion);
// }
/*
 * WebAssembly Bindings for AO-Pro
 * Exports C functions to JavaScript via Emscripten
 */

#include <emscripten/bind.h>
#include <emscripten/val.h>
#include <cstring>
#include <cmath>

extern "C" {
#include "ao_core.h"
}

using namespace emscripten;

/* ============================================================================
 * CONFIGURATION WRAPPER
 * ============================================================================ */

class AOConfig {
public:
    ao_config_t config;
    
    AOConfig() {
        ao_config_init_default(&config);
    }
    
    // Getters
    int getCentroidMethod() const { return config.centroid_method; }
    int getReconMethod() const { return config.recon_method; }
    int getControlMethod() const { return config.control_method; }
    int getNZernikeModes() const { return config.n_zernike_modes; }
    double getLambda() const { return config.regularization_lambda; }
    double getTelescopeD() const { return config.telescope_d; }
    double getWavelength() const { return config.wavelength; }
    double getSampleRate() const { return config.sample_rate_hz; }
    double getMaxStroke() const { return config.dm_max_stroke; }
    double getCoupling() const { return config.dm_coupling; }
    double getLatency() const { return config.max_latency_ms; }
    double getTargetStrehl() const { return config.target_strehl; }
    int getEnableHysteresis() const { return config.enable_hysteresis; }
    int getEnableSPGD() const { return config.enable_spgd; }
    
    // Setters
    void setCentroidMethod(int v) { config.centroid_method = v; }
    void setReconMethod(int v) { config.recon_method = v; }
    void setControlMethod(int v) { config.control_method = v; }
    void setNZernikeModes(int v) { config.n_zernike_modes = v; }
    void setLambda(double v) { config.regularization_lambda = v; }
    void setTelescopeD(double v) { config.telescope_d = v; }
    void setWavelength(double v) { config.wavelength = v; }
    void setSampleRate(double v) { config.sample_rate_hz = v; }
    void setMaxStroke(double v) { config.dm_max_stroke = v; }
    void setCoupling(double v) { config.dm_coupling = v; }
    void setLatency(double v) { config.max_latency_ms = v; }
    void setTargetStrehl(double v) { config.target_strehl = v; }
    void setEnableHysteresis(int v) { config.enable_hysteresis = v; }
    void setEnableSPGD(int v) { config.enable_spgd = v; }
};

/* ============================================================================
 * SUBAPERTURE CONFIGURATION WRAPPER
 * ============================================================================ */

class AOSubapConfig {
public:
    ao_subap_config_t cfg;
    
    AOSubapConfig() {
        memset(&cfg, 0, sizeof(cfg));
    }
    
    void setup(int gridX, int gridY, int subapSize, double pitchPixels, 
               double pitchMeters, double focalLength) {
        cfg.grid_x = gridX;
        cfg.grid_y = gridY;
        cfg.subap_size = subapSize;
        cfg.pitch_pixels = pitchPixels;
        cfg.pitch_meters = pitchMeters;
        cfg.focal_length = focalLength;
    }
};

/* ============================================================================
 * FRAME METADATA WRAPPER
 * ============================================================================ */

class AOFrameMeta {
public:
    ao_frame_metadata_t meta;
    
    AOFrameMeta() {
        memset(&meta, 0, sizeof(meta));
    }
    
    void setup(int width, int height, double exposure, double gain) {
        meta.width = width;
        meta.height = height;
        meta.exposure_ms = exposure;
        meta.gain = gain;
        meta.bit_depth = 16;
    }
};

/* ============================================================================
 * PIPELINE RESULT WRAPPER
 * ============================================================================ */

class AOPipelineResult {
public:
    ao_pipeline_result_t result;
    
    AOPipelineResult() {
        memset(&result, 0, sizeof(result));
    }
    
    ~AOPipelineResult() {
        ao_free_result(&result);
    }
    
    double getStrehl() const { return result.strehl_ratio; }
    double getRMS() const { return result.rms_error; }
    double getBandwidth() const { return result.loop_bandwidth_hz; }
    double getLatency() const { return result.latency_ms; }
    int getNValid() const { return result.n_centroids_valid; }
    int getStatus() const { return result.status; }
    
    val getWavefront(int nx, int ny) const {
        if (!result.wavefront.phase || nx * ny == 0) {
            return val::array();
        }
        return val(typed_memory_view(nx * ny, result.wavefront.phase));
    }
    
    val getDMCommands(int nAct) const {
        if (!result.dm_commands || nAct == 0) {
            return val::array();
        }
        
        std::vector<double> cmds(nAct);
        for (int i = 0; i < nAct; i++) {
            cmds[i] = result.dm_commands[i].command;
        }
        return val(cmds);
    }
    
    val getCentroids(int nSubaps) const {
        if (!result.centroids || nSubaps == 0) {
            return val::array();
        }
        
        std::vector<double> cents(nSubaps * 3);
        for (int i = 0; i < nSubaps; i++) {
            cents[i * 3 + 0] = result.centroids[i].x;
            cents[i * 3 + 1] = result.centroids[i].y;
            cents[i * 3 + 2] = result.centroids[i].valid ? result.centroids[i].quality : -1;
        }
        return val(cents);
    }
    
    val getSlopes(int nSubaps) const {
        if (!result.slopes.gx || !result.slopes.gy || nSubaps == 0) {
            return val::array();
        }
        
        std::vector<double> slopes(nSubaps * 2);
        for (int i = 0; i < nSubaps; i++) {
            slopes[i * 2 + 0] = result.slopes.gx[i];
            slopes[i * 2 + 1] = result.slopes.gy[i];
        }
        return val(slopes);
    }
};

/* ============================================================================
 * MAIN PIPELINE CLASS
 * ============================================================================ */

class AOPipeline {
public:
    int processFrame(val frameData, AOFrameMeta& meta, AOSubapConfig& subap, 
                     AOConfig& config, AOPipelineResult& result) {
        
        unsigned int length = frameData["length"].as<unsigned int>();
        std::vector<uint16_t> frame(length);
        
        val memoryView = val::global("Uint16Array").new_(val::module_property("HEAPU16"),
            reinterpret_cast<uintptr_t>(frame.data()), length);
        memoryView.call<void>("set", frameData);
        
        return ao_process_pipeline(frame.data(), nullptr, nullptr, 
                                   &meta.meta, &subap.cfg, &config.config, 
                                   &result.result);
    }
};

/* ============================================================================
 * UTILITY FUNCTIONS
 * ============================================================================ */

double computeStrehl(double rms) {
    return ao_compute_strehl(rms);
}

double computeRMS(val data) {
    unsigned int len = data["length"].as<unsigned int>();
    std::vector<double> buf(len);
    
    val memoryView = val::global("Float64Array").new_(val::module_property("HEAPF64"),
        reinterpret_cast<uintptr_t>(buf.data()), len);
    memoryView.call<void>("set", data);
    
    return ao_compute_rms(buf.data(), len);
}

val getVersion() {
    return val("AO-Pro v1.0.0 - Adaptive Optics Processing System");
}

/* ============================================================================
 * EMSCRIPTEN BINDINGS
 * ============================================================================ */

EMSCRIPTEN_BINDINGS(ao_pro) {
    // CRITICAL: register std::vector<double> before any bound function
    // returns or accepts one. Without this, Embind has no marshaling code
    // for the type and throws a BindingError ("unknown type
    // NSt3__26vectorIdNS_9allocatorIdEEEE", the mangled name of
    // std::vector<double, std::allocator<double>>) the first time
    // getDMCommands / getCentroids / getSlopes is called — which is exactly
    // what was happening on every single frame, silently forcing a fallback
    // to the TS simulator regardless of whether WASM was "available".
    register_vector<double>("VectorDouble");

    class_<AOConfig>("AOConfig")
        .constructor()
        .function("getCentroidMethod", &AOConfig::getCentroidMethod)
        .function("getReconMethod", &AOConfig::getReconMethod)
        .function("getControlMethod", &AOConfig::getControlMethod)
        .function("getNZernikeModes", &AOConfig::getNZernikeModes)
        .function("getLambda", &AOConfig::getLambda)
        .function("getTelescopeD", &AOConfig::getTelescopeD)
        .function("getWavelength", &AOConfig::getWavelength)
        .function("getSampleRate", &AOConfig::getSampleRate)
        .function("getMaxStroke", &AOConfig::getMaxStroke)
        .function("getCoupling", &AOConfig::getCoupling)
        .function("getLatency", &AOConfig::getLatency)
        .function("getTargetStrehl", &AOConfig::getTargetStrehl)
        .function("getEnableHysteresis", &AOConfig::getEnableHysteresis)
        .function("getEnableSPGD", &AOConfig::getEnableSPGD)
        .function("setCentroidMethod", &AOConfig::setCentroidMethod)
        .function("setReconMethod", &AOConfig::setReconMethod)
        .function("setControlMethod", &AOConfig::setControlMethod)
        .function("setNZernikeModes", &AOConfig::setNZernikeModes)
        .function("setLambda", &AOConfig::setLambda)
        .function("setTelescopeD", &AOConfig::setTelescopeD)
        .function("setWavelength", &AOConfig::setWavelength)
        .function("setSampleRate", &AOConfig::setSampleRate)
        .function("setMaxStroke", &AOConfig::setMaxStroke)
        .function("setCoupling", &AOConfig::setCoupling)
        .function("setLatency", &AOConfig::setLatency)
        .function("setTargetStrehl", &AOConfig::setTargetStrehl)
        .function("setEnableHysteresis", &AOConfig::setEnableHysteresis)
        .function("setEnableSPGD", &AOConfig::setEnableSPGD)
        ;
    
    class_<AOSubapConfig>("AOSubapConfig")
        .constructor()
        .function("setup", &AOSubapConfig::setup)
        ;
    
    class_<AOFrameMeta>("AOFrameMeta")
        .constructor()
        .function("setup", &AOFrameMeta::setup)
        ;
    
    class_<AOPipelineResult>("AOPipelineResult")
        .constructor()
        .function("getStrehl", &AOPipelineResult::getStrehl)
        .function("getRMS", &AOPipelineResult::getRMS)
        .function("getBandwidth", &AOPipelineResult::getBandwidth)
        .function("getLatency", &AOPipelineResult::getLatency)
        .function("getNValid", &AOPipelineResult::getNValid)
        .function("getStatus", &AOPipelineResult::getStatus)
        .function("getWavefront", &AOPipelineResult::getWavefront)
        .function("getDMCommands", &AOPipelineResult::getDMCommands)
        .function("getCentroids", &AOPipelineResult::getCentroids)
        .function("getSlopes", &AOPipelineResult::getSlopes)
        ;
    
    class_<AOPipeline>("AOPipeline")
        .constructor()
        .function("processFrame", &AOPipeline::processFrame)
        ;
    
    function("computeStrehl", &computeStrehl);
    function("computeRMS", &computeRMS);
    function("getVersion", &getVersion);
}