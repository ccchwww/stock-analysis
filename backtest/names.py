"""Ticker -> company name lookup for the TSX 60 universe in config.py.

Hardcoded because these names change rarely (only on rebrand/M&A), unlike
prices. Falls back to the raw ticker anywhere a name is missing, so an
unmapped ticker never breaks the UI -- see get_name() below.
"""

TICKER_NAMES = {
    "RY.TO": "Royal Bank of Canada",
    "TD.TO": "Toronto-Dominion Bank",
    "BNS.TO": "Bank of Nova Scotia",
    "BMO.TO": "Bank of Montreal",
    "CM.TO": "Canadian Imperial Bank of Commerce",
    "NA.TO": "National Bank of Canada",
    "MFC.TO": "Manulife Financial Corporation",
    "SLF.TO": "Sun Life Financial Inc.",
    "GWO.TO": "Great-West Lifeco Inc.",
    "POW.TO": "Power Corporation of Canada",
    "IFC.TO": "Intact Financial Corporation",
    "FFH.TO": "Fairfax Financial Holdings Limited",
    "BN.TO": "Brookfield Corporation",
    "BAM.TO": "Brookfield Asset Management Ltd.",
    "CNQ.TO": "Canadian Natural Resources Limited",
    "SU.TO": "Suncor Energy Inc.",
    "ENB.TO": "Enbridge Inc.",
    "TRP.TO": "TC Energy Corporation",
    "PPL.TO": "Pembina Pipeline Corporation",
    "CVE.TO": "Cenovus Energy Inc.",
    "IMO.TO": "Imperial Oil Limited",
    "TOU.TO": "Tourmaline Oil Corp.",
    "ABX.TO": "Barrick Gold Corporation",
    "AEM.TO": "Agnico Eagle Mines Limited",
    "FNV.TO": "Franco-Nevada Corporation",
    "NTR.TO": "Nutrien Ltd.",
    "TECK-B.TO": "Teck Resources Limited (Class B)",
    "WPM.TO": "Wheaton Precious Metals Corp.",
    "FM.TO": "First Quantum Minerals Ltd.",
    "CNR.TO": "Canadian National Railway Company",
    "CP.TO": "Canadian Pacific Kansas City Limited",
    "WCN.TO": "Waste Connections, Inc.",
    "TRI.TO": "Thomson Reuters Corporation",
    "CTC-A.TO": "Canadian Tire Corporation, Limited (Class A)",
    "WSP.TO": "WSP Global Inc.",
    "ATD.TO": "Alimentation Couche-Tard Inc.",
    "L.TO": "Loblaw Companies Limited",
    "MRU.TO": "Metro Inc.",
    "WN.TO": "George Weston Limited",
    "QSR.TO": "Restaurant Brands International Inc.",
    "DOL.TO": "Dollarama Inc.",
    "FTS.TO": "Fortis Inc.",
    "EMA.TO": "Emera Incorporated",
    "BCE.TO": "BCE Inc.",
    "T.TO": "TELUS Corporation",
    "RCI-B.TO": "Rogers Communications Inc. (Class B)",
    "SHOP.TO": "Shopify Inc.",
    "CSU.TO": "Constellation Software Inc.",
    "GIB-A.TO": "CGI Inc. (Class A)",
    "OTEX.TO": "Open Text Corporation",
    "CLS.TO": "Celestica Inc.",
    "CAR-UN.TO": "Canadian Apartment Properties REIT",
}


def get_name(ticker: str) -> str:
    """Company name for a ticker, falling back to the ticker itself if unmapped."""
    return TICKER_NAMES.get(ticker, ticker)
