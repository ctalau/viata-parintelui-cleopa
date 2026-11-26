"""Shared painted bedroom set for Costică's two wake-up shots."""
from decor import painted_backdrop
from vector_art import collection


def bedroom(coll):
    """Place the quilt in front of the waking rig and its backdrop behind it."""
    room = collection("Dormitor · cameră, pat și pernă", coll)
    quilt = collection("Dormitor · plapumă în prim-plan", coll)
    width, center_y = 13.4, -.70
    painted_backdrop(room, "Dormitor în zori", "dormitor-in-zori.png", width, center_y)
    painted_backdrop(
        quilt, "Plapumă țesută", "dormitor-plapuma.png", width, center_y,
        depth=.81, silhouette="dormitor-plapuma.svg",
    )
