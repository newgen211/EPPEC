# File: backend/ppe_rules.py
# Single source of truth: PPE category → required items

PPE_RULES = {
    "Standard":  {"Gloves"},
    "Droplet":   {"Gloves", "Gown", "Surgical Mask", "Eye Protection"},
    "Contact":   {"Gloves", "Gown"},
    "Airborne":  {"Gloves", "Gown", "N95", "Eye Protection"},
    "High-Risk": {"Gloves", "Gown", "N95", "Face Shield", "Eye Protection"},
}
